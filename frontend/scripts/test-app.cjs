// Run framework-independent domain and adapter tests with the installed TypeScript compiler.
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseChatPush,
  chatPushHref,
  parsePush,
  pushHref,
  pushText,
  SeenPushes,
} = require("../src/notifications/push-message.ts");

test("Push navigation accepts only scoped chat identifiers and preserves bigint party IDs", () => {
  const raw = {
    type: "CHAT_MESSAGE",
    recipientId: "1",
    tripId: "2",
    partyId: "9223372036854775807",
    messageId: "3",
    eventId: "4",
    deliveryId: "5",
    url: "https://untrusted.invalid",
  };
  const push = parseChatPush(raw);
  assert.ok(push);
  assert.equal(push.url, undefined);
  assert.deepEqual(chatPushHref(push), {
    pathname: "/trip/[tripId]/[section]",
    params: {
      tripId: "2",
      section: "chat",
      chatPartyId: "9223372036854775807",
      pushId: "5",
    },
  });
  assert.equal(
    chatPushHref(parseChatPush({ ...raw, partyId: "" })).params.chatPartyId,
    "",
  );
  for (const patch of [
    { type: "OTHER" },
    { tripId: "../profile" },
    { recipientId: "0" },
    { partyId: "9223372036854775808" },
    { messageId: 3 },
    { eventId: null },
    { deliveryId: "-1" },
  ])
    assert.equal(parseChatPush({ ...raw, ...patch }), null);
  assert.equal(parseChatPush(null), null);
});

test("Duplicate push callbacks display once and still allow a separate notification tap", () => {
  const push = parseChatPush({
    type: "CHAT_MESSAGE",
    recipientId: "1",
    tripId: "2",
    partyId: "",
    messageId: "3",
    eventId: "4",
    deliveryId: "5",
  });
  const seen = new SeenPushes();
  assert.equal(seen.accept("display", push), true);
  assert.equal(seen.accept("display", push), false);
  assert.equal(seen.accept("open", push), true);
  assert.equal(seen.accept("open", push), false);
  assert.equal(seen.accept("display", { ...push, recipientId: "2" }), true);
  for (let i = 10; i < 520; i++)
    seen.accept("display", { ...push, deliveryId: String(i) });
  assert.equal(seen.accept("display", push), true);
});

test("Notice push opens only the scoped notice screen and never renders remote body or URLs", () => {
  const raw = {
    type: "TRIP_NOTICE",
    recipientId: "1",
    tripId: "2",
    noticeId: "9223372036854775807",
    eventId: "4",
    deliveryId: "5",
    url: "https://untrusted.invalid",
    title: "remote text",
  };
  const push = parsePush(raw);
  assert.deepEqual(pushHref(push), {
    pathname: "/trip/[tripId]/[section]",
    params: {
      tripId: "2",
      section: "notices",
      noticeId: raw.noticeId,
      pushId: "5",
    },
  });
  assert.equal(push.url, undefined);
  assert.equal(push.title, undefined);
  assert.equal(pushText(push).title, "새 여행 공지");
  for (const patch of [
    { recipientId: "0" },
    { noticeId: "9223372036854775808" },
    { noticeId: 3 },
    { tripId: "../other" },
    { type: "UNKNOWN" },
  ])
    assert.equal(parsePush({ ...raw, ...patch }), null);
  const seen = new SeenPushes();
  assert.equal(seen.accept("display", push), true);
  assert.equal(seen.accept("display", push), false);
  assert.equal(seen.accept("open", push), true);
});

test("Web push click focuses an existing app or opens only its own origin", async () => {
  const vm = require("node:vm");
  let listener, opened, forwarded;
  let windows = [];
  const self = {
    location: {
      href: "https://app.example/firebase-messaging-sw.js?config=%7B%7D",
      origin: "https://app.example",
    },
    addEventListener(type, callback) {
      if (type === "notificationclick") listener = callback;
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => {
        opened = url;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      require.resolve("../public/firebase-messaging-sw.js"),
      "utf8",
    ),
    {
      self,
      URL,
      importScripts() {},
      firebase: { initializeApp() {}, messaging() {} },
    },
  );
  const data = {
    type: "CHAT_MESSAGE",
    recipientId: "1",
    tripId: "2",
    partyId: "",
    messageId: "3",
    eventId: "4",
    deliveryId: "5",
    url: "https://untrusted.invalid",
  };
  const click = async () => {
    let task;
    listener({
      notification: { data: { FCM_MSG: { data } }, close() {} },
      stopImmediatePropagation() {},
      waitUntil(promise) {
        task = promise;
      },
    });
    await task;
  };
  await click();
  assert.equal(new URL(opened).origin, "https://app.example");
  assert.equal(
    JSON.parse(new URL(opened).searchParams.get("push")).tripId,
    "2",
  );
  let focused = false;
  windows = [
    {
      url: "https://app.example/home",
      postMessage(value) {
        forwarded = value;
      },
      focus: async () => {
        focused = true;
      },
    },
  ];
  opened = undefined;
  await click();
  assert.equal(opened, undefined);
  assert.equal(focused, true);
  data.type = "TRIP_NOTICE";
  data.noticeId = "6";
  await click();
  assert.equal(forwarded.payload.noticeId, "6");
  assert.equal(forwarded.type, "WEGOTRIP_PUSH_OPEN");
});
const {
  localDeadlineFields,
  parseLocalDeadline,
  remainingPollMs,
  formatPollRemaining,
} = require("../src/data/poll-deadline.ts");

test("Poll deadlines validate calendar dates and convert local time to an absolute instant", () => {
  const local = new Date(2028, 1, 29, 23, 59);
  const fields = localDeadlineFields(local);
  assert.deepEqual(fields, { date: "2028-02-29", time: "23:59" });
  assert.equal(
    parseLocalDeadline(fields.date, fields.time),
    local.toISOString(),
  );
  for (const [date, time] of [
    ["2026-02-29", "10:00"],
    ["2026-04-31", "10:00"],
    ["2026-13-01", "10:00"],
    ["2026-01-01", "24:00"],
    ["2026-01-01", "10:60"],
    ["2026-01-01", "9:00"],
    ["26-01-01", "10:00"],
    ["2039-01-01", "10:00"],
    ["", ""],
  ])
    assert.throws(() => parseLocalDeadline(date, time), /마감/);
});

test("Poll countdown uses server time and monotonic elapsed time through the exact deadline", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2040-01-01T00:00:00Z"));
  const server = "2026-10-24T00:00:00Z",
    deadline = "2026-10-24T09:01:00+09:00";
  assert.equal(remainingPollMs(deadline, server, 0), 60000);
  assert.equal(remainingPollMs(deadline, server, 59999), 1);
  assert.equal(remainingPollMs(deadline, server, 60000), 0);
  assert.equal(remainingPollMs(deadline, server, 86400000), 0);
  assert.equal(remainingPollMs(deadline, server, -100), 60000);
  assert.equal(formatPollRemaining(1), "1초 남음");
  assert.equal(formatPollRemaining(61000), "1분 1초 남음");
  assert.equal(formatPollRemaining(3600000), "1시간 0분 남음");
  assert.equal(formatPollRemaining(90000000), "1일 1시간 남음");
  assert.equal(formatPollRemaining(0), "마감됐어요");
});

const { sendPhotoAttachments } = require("../src/data/chat-photo-batch.ts");
const {
  uploadPhoto: uploadWebPhoto,
} = require("../src/data/chat-photo-upload.web.ts");
const webPhotoLimit = 8 * 1024 * 1024;
const photoPadding = new Uint8Array(webPhotoLimit + 1);
const webPhotoBlob = (type = "image/jpeg", header = []) =>
  new Blob([new Uint8Array(header), photoPadding], { type });
const pngChunk = (type) => [
  ...new Uint8Array(4),
  ...Buffer.from(type),
  ...new Uint8Array(4),
];
const webPng = (animated = false) =>
  webPhotoBlob("image/png", [
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...pngChunk(animated ? "acTL" : "IDAT"),
  ]);

function photoBrowserFixture(t) {
  const state = {
    draws: [],
    encodes: [],
    closed: 0,
    uploads: [],
    results: [],
    decodeFails: false,
  };
  function global(name, value) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const bitmap = {
    width: 6000,
    height: 4000,
    close() {
      state.closed++;
    },
  };
  global("createImageBitmap", async (file, options) => {
    if (state.decodeFails) throw new Error("decode failed");
    state.decodeOptions = options;
    return bitmap;
  });
  const context = {
    drawImage(source, x, y, width, height) {
      state.draws.push({ source, width, height });
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, type, quality) {
      state.encodes.push({
        type,
        quality,
        width: canvas.width,
        height: canvas.height,
      });
      callback(
        state.results.length
          ? state.results.shift()
          : new Blob(["compressed"], { type }),
      );
    },
  };
  global("document", { createElement: () => canvas });
  return {
    state,
    bitmap,
    canvas,
    global,
    send: (file, filename = "trip.jpeg") =>
      uploadWebPhoto(
        {
          id: "photo",
          uri: "blob:preview",
          file,
          filename,
          width: 1,
          height: 1,
        },
        {
          upload: async (form) => {
            state.uploads.push(form.get("file"));
            return { id: "uploaded" };
          },
        },
      ),
  };
}

test("Web photo uploads keep originals at or below 8MiB and preserve GIF animation", async () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    const original = new Blob([photoPadding.subarray(0, webPhotoLimit)], {
      type,
    });
    let sent;
    await uploadWebPhoto(
      { id: "photo", uri: "unused", file: original, filename: "original.file" },
      {
        upload: async (form) => {
          sent = form.get("file");
        },
      },
    );
    assert.equal(sent.size, original.size);
    assert.equal(sent.type, type);
    assert.equal(sent.name, "original.file");
  }
});

test("Oversized web photos use decoded orientation and dimensions and send a correctly named JPEG", async (t) => {
  const { state, bitmap, canvas, send } = photoBrowserFixture(t);
  assert.deepEqual(await send(webPhotoBlob()), { id: "uploaded" });
  assert.deepEqual(state.decodeOptions, { imageOrientation: "from-image" });
  assert.deepEqual(state.draws[0], {
    source: bitmap,
    width: 2560,
    height: 1707,
  });
  assert.equal(state.uploads[0].type, "image/jpeg");
  assert.equal(state.uploads[0].name, "trip.jpg");
  assert.ok(state.uploads[0].size < webPhotoLimit);
  assert.equal(state.closed, 1);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test("Web compression lowers quality and then dimensions until the payload fits", async (t) => {
  const { state, send } = photoBrowserFixture(t);
  const large = webPhotoBlob();
  state.results.push(large, large, large, large);
  await send(large);
  assert.deepEqual(
    state.encodes.map(({ quality }) => quality),
    [0.85, 0.7, 0.55, 0.85, 0.7],
  );
  assert.deepEqual(
    state.draws.map(({ width, height }) => [width, height]),
    [
      [2560, 1707],
      [1920, 1280],
    ],
  );
  assert.equal(state.uploads.length, 1);
});

test("Oversized transparent PNG uses WebP and keeps the returned media type and filename consistent", async (t) => {
  const { state, send } = photoBrowserFixture(t);
  await send(webPng(), "map.png");
  assert.equal(state.encodes[0].type, "image/webp");
  assert.equal(state.uploads[0].type, "image/webp");
  assert.equal(state.uploads[0].name, "map.webp");
});

test("Browsers without WebP encoding fall back to PNG and reduce dimensions rather than discarding transparency", async (t) => {
  const { state, send } = photoBrowserFixture(t);
  state.results.push(webPng(), new Blob(["small png"], { type: "image/png" }));
  await send(webPng(), "map.png");
  assert.deepEqual(
    state.encodes.map(({ width }) => width),
    [2560, 1920],
  );
  assert.equal(state.uploads[0].type, "image/png");
  assert.equal(state.uploads[0].name, "map.png");
});

test("Oversized animated GIF, WebP and PNG are never flattened or uploaded", async (t) => {
  const { state, send } = photoBrowserFixture(t);
  const webp = [
    ...Buffer.from("RIFF"),
    0,
    0,
    0,
    0,
    ...Buffer.from("WEBPVP8X"),
    0,
    0,
    0,
    0,
    2,
  ];
  for (const file of [
    webPhotoBlob("image/gif"),
    webPhotoBlob("image/webp", webp),
    webPng(true),
  ])
    await assert.rejects(send(file), /움직이는 이미지/);
  assert.equal(state.draws.length, 0);
  assert.equal(state.uploads.length, 0);
});

test("Web decoding falls back to an image element and releases its own temporary URL", async (t) => {
  const { state, global, send } = photoBrowserFixture(t);
  state.decodeFails = true;
  const revoked = [];
  t.mock.method(URL, "createObjectURL", () => "blob:temporary");
  t.mock.method(URL, "revokeObjectURL", (uri) => revoked.push(uri));
  global(
    "Image",
    class {
      naturalWidth = 1200;
      naturalHeight = 2400;
      set src(value) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    },
  );
  await send(webPhotoBlob());
  assert.deepEqual(
    state.draws.map(({ width, height }) => [width, height]),
    [[1200, 2400]],
  );
  assert.deepEqual(revoked, ["blob:temporary"]);
  assert.equal(state.uploads.length, 1);
});

test("Failed web decoding or encoding never uploads a broken image and cleans temporary resources", async (t) => {
  const { state, canvas, global, send } = photoBrowserFixture(t);
  state.results.push(null);
  await assert.rejects(send(webPhotoBlob()), /압축하지 못했어요/);
  assert.equal(state.closed, 1);
  assert.equal(canvas.width, 0);
  assert.equal(state.uploads.length, 0);
  state.decodeFails = true;
  const revoked = [];
  t.mock.method(URL, "createObjectURL", () => "blob:failed");
  t.mock.method(URL, "revokeObjectURL", (uri) => revoked.push(uri));
  global(
    "Image",
    class {
      set src(value) {
        if (value) queueMicrotask(() => this.onerror?.());
      }
    },
  );
  await assert.rejects(send(webPhotoBlob()), /압축하지 못했어요/);
  assert.deepEqual(revoked, ["blob:failed"]);
  assert.equal(state.uploads.length, 0);
});

test("Web compression has a finite size budget and refuses unreadable, empty and unsupported files", async (t) => {
  const { state, canvas, send } = photoBrowserFixture(t);
  const large = webPhotoBlob();
  state.results.push(...Array(12).fill(large));
  await assert.rejects(send(large), /충분히 줄이지 못했어요/);
  assert.equal(state.encodes.length, 12);
  assert.equal(state.closed, 1);
  assert.equal(canvas.width, 0);
  assert.equal(state.uploads.length, 0);
  await assert.rejects(send(new Blob([], { type: "image/jpeg" })), /비어 있는/);
  await assert.rejects(
    send(new Blob(["invalid"], { type: "__proto__" })),
    /JPG/,
  );
  await assert.rejects(send(webPhotoBlob("image/png")), /압축하지 못했어요/);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  await assert.rejects(
    uploadWebPhoto(
      { id: "bad", uri: "blob:gone" },
      { upload: async () => assert.fail("must not upload") },
    ),
    /읽지 못했어요/,
  );
});

test("Selected chat photos upload and send in selection order with one action", async () => {
  const attachments = ["third", "first", "second"].map((id) => ({
    photo: { id, uri: id },
  }));
  const calls = [];
  const complete = await sendPhotoAttachments(attachments, {
    upload: async (photo) => {
      calls.push(`upload:${photo.id}`);
      return { id: photo.id };
    },
    send: async (id) => calls.push(`send:${id}`),
    active: () => true,
    onSent: (attachment) => calls.push(`done:${attachment.photo.id}`),
  });
  assert.equal(complete, true);
  assert.deepEqual(calls, [
    "upload:third",
    "send:third",
    "done:third",
    "upload:first",
    "send:first",
    "done:first",
    "upload:second",
    "send:second",
    "done:second",
  ]);
  assert.ok(attachments.every((item) => item.sent));
});

test("Photo batch retry keeps successful messages and reuses the failed message's uploaded image", async () => {
  const attachments = ["a", "b", "c"].map((id) => ({ photo: { id, uri: id } }));
  const uploads = [];
  const sends = [];
  let fail = true;
  const actions = {
    upload: async (photo) => {
      uploads.push(photo.id);
      return { id: `upload-${photo.id}` };
    },
    send: async (id) => {
      sends.push(id);
      if (id === "upload-b" && fail) {
        fail = false;
        throw new Error("lost response");
      }
    },
    active: () => true,
    onSent: () => {},
  };
  await assert.rejects(
    sendPhotoAttachments(attachments, actions),
    /lost response/,
  );
  assert.deepEqual(
    attachments.map((item) => !!item.sent),
    [true, false, false],
  );
  assert.equal(attachments[1].uploadId, "upload-b");
  await sendPhotoAttachments(attachments, actions);
  assert.deepEqual(uploads, ["a", "b", "c"]);
  assert.deepEqual(sends, ["upload-a", "upload-b", "upload-b", "upload-c"]);
});

test("Photo batch stops on upload failure and does not publish or skip the failed photo", async () => {
  const attachments = ["a", "b"].map((id) => ({ photo: { id, uri: id } }));
  let sends = 0;
  await assert.rejects(
    sendPhotoAttachments(attachments, {
      upload: async () => {
        throw new Error("offline");
      },
      send: async () => {
        sends++;
      },
      active: () => true,
      onSent: () => {},
    }),
    /offline/,
  );
  assert.equal(sends, 0);
  assert.equal(attachments[0].uploadId, undefined);
  assert.ok(attachments.every((item) => !item.sent));
});

test("Leaving a room before or during photo upload prevents further publishing", async () => {
  const attachments = [{ photo: { id: "a", uri: "a" } }];
  let active = false;
  let uploads = 0;
  let sends = 0;
  const actions = {
    upload: async () => {
      uploads++;
      active = false;
      return { id: "uploaded" };
    },
    send: async () => {
      sends++;
    },
    active: () => active,
    onSent: () => {},
  };
  assert.equal(await sendPhotoAttachments(attachments, actions), false);
  assert.equal(uploads, 0);
  active = true;
  assert.equal(await sendPhotoAttachments(attachments, actions), false);
  assert.equal(uploads, 1);
  assert.equal(sends, 0);
  assert.equal(attachments[0].uploadId, "uploaded");
});

const {
  ChatApi,
  mergeMessages,
  loadChatUpdates,
} = require("../src/data/chat-api.ts");

test("Out-of-order snapshots cannot reopen an expired poll with the same revision", () => {
  const row = (serverNow, closed) => ({
    id: "1",
    revision: "0",
    poll: { serverNow, closed, closesAt: "2026-10-24T00:01:00Z" },
  });
  const current = row("2026-10-24T00:01:01Z", true);
  const stale = row("2026-10-24T00:00:50Z", false);
  assert.deepEqual(mergeMessages([current], [stale]), [current]);
  assert.deepEqual(mergeMessages([stale], [current]), [current]);
});

test("Chat reconnect fills gaps larger than one history page and stops at the previous synchronized message", async () => {
  const calls = [];
  const row = (id) => ({ id, revision: "0" });
  const pages = [
    { items: [row("109"), row("110")], nextCursor: "109" },
    { items: [row("107"), row("108")], nextCursor: "107" },
    {
      items: [row("103"), row("104"), row("105"), row("106")],
      nextCursor: "103",
    },
  ];
  const result = await loadChatUpdates(
    {
      history: async (before) => {
        calls.push(before);
        return pages[calls.length - 1];
      },
    },
    "104",
  );
  assert.deepEqual(calls, [undefined, "109", "107"]);
  assert.deepEqual(
    result.items.map((m) => m.id),
    ["103", "104", "105", "106", "107", "108", "109", "110"],
  );
  assert.equal(result.nextCursor, "103");
  const repeated = { history: async () => pages[0] };
  await assert.rejects(loadChatUpdates(repeated, "1"), /대화 목록/);
  let initialReads = 0;
  await loadChatUpdates(
    {
      history: async () => {
        initialReads++;
        return pages[0];
      },
    },
    null,
  );
  assert.equal(initialReads, 1);
});

test("Chat merges out-of-order history, socket and vote responses without duplicates or bigint precision loss", () => {
  const message = (id, revision, text) => ({
    id,
    revision,
    text,
    kind: "TEXT",
  });
  const current = [
    message("9223372036854775806", "12", "latest vote"),
    message("9", "0", "first"),
  ];
  const incoming = [
    message("9223372036854775806", "9", "stale vote"),
    message("10", "0", "middle"),
    message("9", "0", "first"),
  ];
  const merged = mergeMessages(current, incoming);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["9", "10", "9223372036854775806"],
  );
  assert.equal(merged[2].text, "latest vote");
  assert.equal(current.length, 2);
  assert.equal(
    mergeMessages(merged, [message("9223372036854775806", "13", "closed")])[2]
      .text,
    "closed",
  );
});

test("Every party chat operation keeps its channel scope including pagination, images and poll votes", async () => {
  const calls = [];
  const api = {
    request: async (...args) => {
      calls.push(args);
      return {};
    },
  };
  const party = new ChatApi(api, "71", "9223372036854775806");
  await party.history("9223372036854775805");
  await party.message("12");
  await party.send("hello", "4", "retry-key");
  await party.poll({ question: "Where?", options: [] }, "poll-key");
  await party.vote("8", null);
  await party.close("8");
  const file = new FormData();
  await party.upload(file);
  for (const [path] of calls) {
    const url = new URL(path, "http://test");
    assert.equal(url.searchParams.get("partyId"), "9223372036854775806");
    assert.ok(url.pathname.startsWith("/trips/71/chat/"));
  }
  assert.ok(calls[0][0].endsWith("&before=9223372036854775805"));
  assert.deepEqual(calls[4][2], { optionId: null });
  assert.equal(calls[6][2], file);
  const all = new ChatApi(api, "71", null);
  await all.history();
  assert.equal(
    new URL(calls.at(-1)[0], "http://test").searchParams.has("partyId"),
    false,
  );
});

test("Multi-choice poll mode and explicit option selection states survive API serialization", async () => {
  const calls = [];
  const api = new ChatApi(
    {
      request: async (...args) => {
        calls.push(args);
        return {};
      },
    },
    "71",
    "83",
  );
  const body = {
    question: "Where?",
    options: [
      { label: "A", placeId: null },
      { label: "B", placeId: null },
    ],
    allowMultiple: true,
  };
  await api.poll(body, "multi-key");
  await api.vote("8", "11", true);
  await api.vote("8", "12", true);
  await api.vote("8", "11", false);
  await api.vote("9", null);
  assert.equal(calls[0][2], body);
  assert.deepEqual(calls[0][3], { "Idempotency-Key": "multi-key" });
  assert.deepEqual(
    calls.slice(1).map((call) => call[2]),
    [
      { optionId: "11", selected: true },
      { optionId: "12", selected: true },
      { optionId: "11", selected: false },
      { optionId: null },
    ],
  );
  assert.ok(
    calls.every(
      (call) =>
        new URL(call[0], "http://test").searchParams.get("partyId") === "83",
    ),
  );
});

test("Image history filters every page and reconnect request while message writes keep their original room scope", async () => {
  const calls = [];
  const api = {
    request: async (...args) => {
      calls.push(args);
      const url = new URL(args[0], "http://test");
      if (args[1] === "POST") return {};
      const first = !url.searchParams.has("before");
      return first
        ? {
            items: [{ id: "150", revision: "0", kind: "IMAGE" }],
            nextCursor: "150",
          }
        : {
            items: [{ id: "20", revision: "0", kind: "IMAGE" }],
            nextCursor: null,
          };
    },
  };
  const images = new ChatApi(api, "71", "83", true);
  const result = await loadChatUpdates(images, "20");
  assert.deepEqual(
    result.items.map((message) => message.id),
    ["20", "150"],
  );
  assert.equal(calls.length, 2);
  for (const [path] of calls) {
    const url = new URL(path, "http://test");
    assert.equal(url.searchParams.get("imagesOnly"), "true");
    assert.equal(url.searchParams.get("partyId"), "83");
  }
  await images.send("caption", "91", "image-key");
  const writeUrl = new URL(calls.at(-1)[0], "http://test");
  assert.equal(writeUrl.searchParams.get("partyId"), "83");
  assert.equal(writeUrl.searchParams.has("imagesOnly"), false);
  await new ChatApi(api, "71", null, true).history();
  const allImagesUrl = new URL(calls.at(-1)[0], "http://test");
  assert.equal(allImagesUrl.searchParams.get("imagesOnly"), "true");
  assert.equal(allImagesUrl.searchParams.has("partyId"), false);
  await new ChatApi(api, "71", null, false).history();
  assert.equal(
    new URL(calls.at(-1)[0], "http://test").searchParams.has("imagesOnly"),
    false,
  );
});

test("Multipart uploads preserve file bytes and browser boundary headers through an explicit 401 token refresh", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const before = global.fetch;
  t.after(() => {
    global.fetch = before;
  });
  const api = new UserApi("https://test/api", {
    kind: "NATIVE",
    read: async () => "refresh",
    write: async () => {},
    clear: async () => {},
  });
  api.token = "expired";
  const body = new FormData();
  body.append(
    "file",
    new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    "photo.png",
  );
  let uploads = 0;
  global.fetch = async (url, options) => {
    if (url.endsWith("/auth/tokens/refresh"))
      return new Response(
        JSON.stringify({
          code: "SUCCESS",
          data: { accessToken: "fresh", refreshToken: "rotated", userId: "1" },
        }),
      );
    uploads++;
    assert.equal(options.body, body);
    assert.equal(options.headers["Content-Type"], undefined);
    assert.equal(
      options.headers.Authorization,
      uploads === 1 ? "Bearer expired" : "Bearer fresh",
    );
    return uploads === 1
      ? new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 })
      : new Response(
          JSON.stringify({
            code: "SUCCESS",
            data: { id: "5", url: "https://res.cloudinary.com/test/photo.png" },
          }),
        );
  };
  assert.equal(
    (await api.request("/trips/1/chat/images", "POST", body)).id,
    "5",
  );
  assert.equal(uploads, 2);
  assert.equal(api.chatSocketUrl, "wss://test/ws/chat");
});
const { applyCommand } = require("../src/domain/commands.ts");
const {
  equalShares,
  calculateSettlement,
  datesBetween,
  selectHomeTrip,
} = require("../src/domain/models.ts");
const {
  createSeedWorkspace,
  SAMPLE_EMAIL,
} = require("../src/data/fixtures/workspace.ts");
const { MockTravelRepository } = require("../src/data/mock-repository.ts");
const { HttpTravelRepository } = require("../src/data/http-repository.ts");
const { searchPlaces } = require("../src/data/place-search.ts");
const {
  DeviceRegistration,
} = require("../src/notifications/device-registration.ts");

function homeTrip(id, startDate, endDate = startDate, archived = false) {
  return {
    ...createSeedWorkspace().trips[0],
    id,
    startDate,
    endDate,
    archived,
  };
}

test("Home selects the nearest upcoming unarchived departure without reordering trips", () => {
  const trips = [
    homeTrip("later", "2026-11-01"),
    homeTrip("past", "2026-09-25"),
    homeTrip("archived", "2026-09-27", "2026-09-28", true),
    homeTrip("nearest", "2026-09-28"),
    homeTrip("same-day", "2026-09-28"),
  ];
  const before = structuredClone(trips);
  assert.equal(selectHomeTrip(trips, "2026-09-26").id, "nearest");
  assert.deepEqual(trips, before);
});

test("Home prioritizes ongoing trips over today's and future departures", () => {
  const trips = [
    homeTrip("tomorrow", "2026-09-27"),
    homeTrip("today", "2026-09-26"),
    homeTrip("archived-ongoing", "2026-09-20", "2026-09-30", true),
    homeTrip("ongoing", "2026-09-25", "2026-09-28"),
    homeTrip("earlier-ongoing", "2026-09-24", "2026-09-26"),
  ];
  assert.equal(selectHomeTrip(trips, "2026-09-26").id, "earlier-ongoing");
});

test("Home includes departure and end dates and switches trips after the end date", () => {
  const trips = [
    homeTrip("next", "2026-09-29"),
    homeTrip("current", "2026-09-26", "2026-09-27"),
  ];
  assert.equal(selectHomeTrip(trips, "2026-09-26").id, "current");
  assert.equal(selectHomeTrip(trips, "2026-09-27").id, "current");
  assert.equal(selectHomeTrip(trips, "2026-09-28").id, "next");
});

test("Home has no featured trip when only finished or archived trips remain", () => {
  assert.equal(selectHomeTrip([], "2026-09-26"), undefined);
  assert.equal(
    selectHomeTrip(
      [
        homeTrip("finished", "2026-09-23", "2026-09-25"),
        homeTrip("archived", "2026-10-01", "2026-10-02", true),
      ],
      "2026-09-26",
    ),
    undefined,
  );
});

function pushFixture(permission = "undetermined") {
  const values = new Map(),
    calls = [],
    states = [];
  let changed = () => {},
    token = "fcm-one";
  const storage = {
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  const platform = {
    deviceType: "ANDROID",
    permission: async () => permission,
    requestPermission: async () => {
      calls.push("permission");
      permission = "granted";
      return permission;
    },
    token: async () => token,
    deleteToken: async () => {
      calls.push("delete-token");
    },
    subscribe: (listener) => {
      changed = listener;
      return () => {
        changed = () => {};
      };
    },
    openSettings: async () => {},
  };
  const api = {
    registerDevice: async (body) => {
      calls.push(body);
      return { id: "42" };
    },
    removeDevice: async (id) => {
      calls.push(`remove-${id}`);
    },
  };
  const make = () =>
    new DeviceRegistration(
      api,
      storage,
      platform,
      "http://test/api",
      "1",
      (state) => states.push(state),
    );
  return {
    values,
    calls,
    states,
    platform,
    api,
    make,
    changeToken: (value) => {
      token = value;
      changed();
    },
    changePermission: (value) => {
      permission = value;
    },
  };
}

test("Push login offers permission without requesting or registering until the user allows", async () => {
  const f = pushFixture(),
    registration = f.make();
  await registration.start();
  assert.equal(f.states.at(-1), "offer");
  assert.equal(f.calls.length, 0);
  const requested = registration.request();
  assert.equal(f.calls[0], "permission"); // Browser user gesture is not lost to an await.
  await requested;
  assert.equal(f.states.at(-1), "registered");
  assert.equal(f.calls[1].fcmToken, "fcm-one");
});
test("Logout does not wait for an unanswered permission prompt or register after it resolves", async () => {
  const f = pushFixture();
  let allow;
  f.platform.requestPermission = () =>
    new Promise((resolve) => {
      allow = () => resolve("granted");
    });
  const registration = f.make();
  await registration.start();
  const requesting = registration.request();
  await Promise.resolve();
  await registration.stop();
  allow();
  await requesting;
  assert.deepEqual(f.calls, ["delete-token"]);
  assert.notEqual(f.states.at(-1), "registered");
});
test("Push denial and a dismissed explanation are not repeatedly prompted on login", async () => {
  const denied = pushFixture("denied");
  await denied.make().start();
  assert.equal(denied.states.at(-1), "denied");
  assert.deepEqual(denied.calls, []);
  const f = pushFixture(),
    first = f.make();
  await first.start();
  await first.dismiss();
  first.cancel();
  await f.make().start();
  assert.equal(f.states.at(-1), "idle");
  assert.deepEqual(f.calls, []);
});
test("Granted push registration reuses its device ID and refreshes changed tokens without duplicates", async () => {
  const f = pushFixture("granted"),
    registration = f.make();
  await registration.start();
  await registration.sync();
  assert.equal(f.calls.length, 1);
  f.changeToken("fcm-two");
  await registration.sync();
  assert.deepEqual(f.calls[1], {
    deviceId: "42",
    fcmToken: "fcm-two",
    deviceType: "ANDROID",
  });
  assert.equal(f.calls.length, 2);
  registration.cancel();
  await f.make().start();
  assert.equal(f.calls[2].deviceId, "42");
});
test("Push registration failure does not reject login and can be retried", async () => {
  const f = pushFixture("granted");
  let failing = true;
  f.api.registerDevice = async () => {
    if (failing) throw new Error("offline");
    return { id: "42" };
  };
  const registration = f.make();
  await registration.start();
  assert.equal(f.states.at(-1), "error");
  failing = false;
  await registration.sync();
  assert.equal(f.states.at(-1), "registered");
});
test("Revoking OS notification permission removes the server device and invalidates its token", async () => {
  const f = pushFixture("granted"),
    registration = f.make();
  await registration.start();
  f.changePermission("denied");
  await registration.sync();
  assert.deepEqual(f.calls.slice(1), ["remove-42", "delete-token"]);
  assert.equal(f.states.at(-1), "denied");
});
test("Logout drains an in-flight device registration and removes the resulting device", async () => {
  const f = pushFixture("granted");
  let release, began;
  const entered = new Promise((resolve) => {
    began = resolve;
  });
  f.api.registerDevice = () => {
    began();
    return new Promise((resolve) => {
      release = () => resolve({ id: "99" });
    });
  };
  const registration = f.make();
  const start = registration.start();
  await entered;
  const stop = registration.stop();
  release();
  await Promise.all([start, stop]);
  assert.deepEqual(f.calls, ["remove-99", "delete-token"]);
  assert.equal(f.values.size, 0);
  assert.notEqual(f.states.at(-1), "registered");
});
test("A stale device ID is recreated after 404 but a token owned by another account is not claimed", async () => {
  const f = pushFixture("granted");
  f.values.set("push-device-http%3A%2F%2Ftest%2Fapi-1", "old");
  f.api.registerDevice = async (body) => {
    f.calls.push(body);
    if (body.deviceId) throw { status: 404 };
    return { id: "42" };
  };
  await f.make().start();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].deviceId, undefined);
  const conflict = pushFixture("granted");
  conflict.api.registerDevice = async (body) => {
    conflict.calls.push(body);
    throw { status: 409 };
  };
  await conflict.make().start();
  assert.equal(conflict.calls.length, 1);
  assert.equal(conflict.states.at(-1), "error");
});

test("장소 검색은 한글 검색어를 인코딩하고 잘못된 위치 결과를 제외", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let requestedUrl;
  const place = {
    id: "google-hotel",
    name: "호텔",
    address: "부산",
    category: "숙소",
    coordinates: { latitude: 35, longitude: 129 },
  };
  global.fetch = async (url) => {
    requestedUrl = url;
    return new Response(
      JSON.stringify([
        place,
        { ...place, coordinates: { latitude: 999, longitude: 129 } },
      ]),
    );
  };
  assert.deepEqual(await searchPlaces(" 부산 호텔 "), [place]);
  assert.ok(requestedUrl.endsWith("query=" + encodeURIComponent("부산 호텔")));
  await assert.rejects(searchPlaces(" "), /검색어/);
  global.fetch = async () =>
    new Response(JSON.stringify({ message: "서비스 준비 중" }), {
      status: 503,
    });
  await assert.rejects(searchPlaces("호텔"), /서비스 준비 중/);
});

test("검색한 장소를 저장하면 이름·주소·좌표·Google 장소 ID가 유지", () => {
  const item = {
    id: "searched-place",
    name: "호텔",
    address: "부산",
    category: "숙소",
    note: "예약 확인",
    coordinates: { latitude: 35, longitude: 129 },
    googlePlaceId: "google-hotel",
  };
  const next = applyCommand(createSeedWorkspace(), "jiwoo", {
    type: "item.save",
    tripId: "busan",
    collection: "places",
    item,
  });
  assert.deepEqual(
    next.trips[0].places.find((place) => place.id === item.id),
    item,
  );
});
const {
  buildDayRoute,
  compareAgenda,
  getEffectiveAgenda,
  parseCoordinates,
  validCoordinates,
} = require("../src/domain/route.ts");
const { participationLabel } = require("../src/domain/participation.ts");
const {
  fitCamera,
  screenPoint,
  project,
  unproject,
  visibleTiles,
} = require("../src/domain/map-projection.ts");
const { addSeedCoordinates } = require("../src/data/migrations.ts");
const seed = createSeedWorkspace;
const save = (collection, item) => ({
  type: "item.save",
  tripId: "busan",
  collection,
  item,
});
const expense = (overrides = {}) => ({
  ...seed().trips[0].expenses[0],
  ...overrides,
});
const update = (overrides = {}) => ({
  type: "trip.update",
  tripId: "busan",
  input: {
    title: "바다 보러, 부산",
    destination: "부산",
    startDate: "2026-09-19",
    endDate: "2026-09-21",
    budget: 1200000,
    archived: false,
    ...overrides,
  },
});
class MemoryStorage {
  values = new Map();
  fail = false;
  async read(key) {
    return this.values.get(key) ?? null;
  }
  async write(key, value) {
    if (this.fail) throw new Error("저장 공간 부족");
    this.values.set(key, value);
  }
  async remove(key) {
    this.values.delete(key);
  }
}
test("지도 좌표는 두 숫자와 범위를 검증하고 빈 값은 위치 삭제로 처리", () => {
  assert.equal(parseCoordinates("", "  "), null);
  assert.deepEqual(parseCoordinates("0", "-0.12"), {
    latitude: 0,
    longitude: -0.12,
  });
  for (const [lat, lon] of [
    ["", "129"],
    ["35", ""],
    ["91", "129"],
    ["35", "181"],
    ["NaN", "129"],
    ["0x20", "129"],
  ])
    assert.throws(() => parseCoordinates(lat, lon), /위도/);
  for (const coordinates of [
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: "129" },
    { latitude: 0 },
    { latitude: null, longitude: 0 },
  ]) {
    assert.equal(validCoordinates(coordinates), false);
    assert.throws(
      () =>
        applyCommand(
          seed(),
          "jiwoo",
          save("places", { ...seed().trips[0].places[0], coordinates }),
        ),
      /위도/,
    );
  }
});
test("날짜/파티별 지도는 공통 일정을 포함하고 다른 파티 사이를 연결하지 않음", () => {
  const trip = seed().trips[0];
  const snapshot = JSON.stringify(trip);
  const route = buildDayRoute(trip, "2026-09-19", null);
  assert.deepEqual(
    route.agenda.map((a) => a.id),
    ["a1", "a2", "a3", "a4", "a5"],
  );
  assert.equal(route.located.length, 5);
  assert.ok(
    !route.segments.some(
      (s) => s.from.agenda.id === "a3" && s.to.agenda.id === "a4",
    ),
  );
  assert.deepEqual(
    route.segments.map((s) => `${s.from.agenda.id}-${s.to.agenda.id}`).sort(),
    ["a1-a2", "a2-a3", "a2-a4", "a3-a5", "a4-a5"],
  );
  const cafe = buildDayRoute(trip, "2026-09-19", "cafe");
  assert.deepEqual(
    cafe.agenda.map((a) => a.id),
    ["a1", "a2", "a3", "a5"],
  );
  assert.equal(JSON.stringify(trip), snapshot);
  assert.equal(buildDayRoute(trip, "2026-09-21", null).stops.length, 0);
  const nextDay = buildDayRoute(trip, "2026-09-20", null);
  assert.equal(nextDay.missing.length, 1);
  assert.equal(nextDay.segments.length, 0);
});
test("빠진 위치와 겹친 시간은 연결을 끊고 같은 장소의 재방문은 순서를 유지", () => {
  const trip = seed().trips[0];
  trip.places.find((p) => p.id === "p1").coordinates = null;
  const route = buildDayRoute(trip, "2026-09-19", "cafe");
  assert.deepEqual(
    route.stops.map((s) => s.number),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    route.segments.map((s) => `${s.from.agenda.id}-${s.to.agenda.id}`),
    ["a3-a5"],
  );
  trip.agenda.find((a) => a.id === "a3").endTime = "19:00";
  const rejoined = buildDayRoute(trip, "2026-09-19", "cafe");
  assert.deepEqual(
    rejoined.agenda
      .filter((a) => a.id === "a5")
      .map((a) => [a.startTime, a.endTime]),
    [["19:00", "20:00"]],
  );
  assert.deepEqual(
    rejoined.segments.map((s) => [
      s.from.agenda.id,
      s.to.agenda.id,
      s.to.agenda.startTime,
    ]),
    [["a3", "a5", "19:00"]],
  );
  const repeated = buildDayRoute(seed().trips[0], "2026-09-19", "beach");
  assert.equal(repeated.stops[1].place.id, repeated.stops[2].place.id);
  assert.equal(repeated.stops[2].number, 3);
});

function participationTrip(items) {
  const trip = seed().trips[0];
  const base = trip.agenda[0];
  trip.agenda = items.map((item) => ({
    ...base,
    title: `일정 ${item.id}`,
    date: "2026-09-19",
    startTime: "10:00",
    endTime: "11:00",
    placeId: "p1",
    partyId: null,
    ...item,
  }));
  return trip;
}

function participationWindows(agenda, id) {
  return agenda
    .filter((item) => item.id === id)
    .map((item) => [item.startTime, item.endTime]);
}

test("파티 일정에 가려진 공통 일정은 숨기고 남은 참여 시간에 합류 또는 이탈", () => {
  for (const [startTime, endTime, expected] of [
    ["10:00", "11:00", []],
    ["10:00", "10:30", [["10:30", "11:00"]]],
    ["10:30", "11:00", [["10:00", "10:30"]]],
    ["09:45", "10:15", [["10:15", "11:00"]]],
    ["10:45", "11:15", [["10:00", "10:45"]]],
    ["09:30", "11:30", []],
    ["09:00", "10:00", [["10:00", "11:00"]]],
    ["11:00", "12:00", [["10:00", "11:00"]]],
  ]) {
    const trip = participationTrip([
      { id: "common" },
      { id: "party", partyId: "cafe", startTime, endTime },
    ]);
    const actual = getEffectiveAgenda(trip, "2026-09-19", "cafe");
    assert.deepEqual(
      participationWindows(actual, "common"),
      expected,
      `${startTime}~${endTime}`,
    );
    assert.deepEqual(participationWindows(actual, "party"), [
      [startTime, endTime],
    ]);
  }
});

test("공통 일정 중간의 파티 일정 이후 원래 일정으로 복귀하며 구간 키와 편집 ID를 구분", () => {
  const trip = participationTrip([
    { id: "common", endTime: "12:00", note: "원본 메모", placeId: "p2" },
    { id: "party", partyId: "cafe", startTime: "10:30", endTime: "11:00" },
  ]);
  const before = structuredClone(trip);
  const agenda = getEffectiveAgenda(trip, "2026-09-19", "cafe");
  assert.deepEqual(
    agenda.map((item) => item.id),
    ["common", "party", "common"],
  );
  assert.deepEqual(participationWindows(agenda, "common"), [
    ["10:00", "10:30"],
    ["11:00", "12:00"],
  ]);
  const common = agenda.filter((item) => item.id === "common");
  for (const item of common) {
    assert.equal(item.originalStartTime, "10:00");
    assert.equal(item.originalEndTime, "12:00");
    assert.equal(item.note, "원본 메모");
    assert.equal(item.title, trip.agenda[0].title);
    assert.equal(item.placeId, "p2");
    assert.equal(item.partyId, null);
    assert.equal(typeof item.occurrenceId, "string");
    assert.ok(item.occurrenceId.length > 0);
  }
  assert.equal(
    new Set(agenda.map((item) => item.occurrenceId)).size,
    agenda.length,
  );
  assert.deepEqual(getEffectiveAgenda(trip, "2026-09-19", "cafe"), agenda);
  assert.deepEqual(trip, before);

  // An unrelated earlier item must not change the keys of existing occurrences.
  const extended = participationTrip([
    { id: "earlier", startTime: "08:00", endTime: "09:00" },
    ...trip.agenda,
  ]);
  assert.deepEqual(
    getEffectiveAgenda(extended, "2026-09-19", "cafe")
      .filter((item) => item.id !== "earlier")
      .map((item) => item.occurrenceId),
    agenda.map((item) => item.occurrenceId),
  );
});

test("계산된 참여 구간은 중간 합류·이탈을 표시하고 변경 없는 일정에는 안내를 붙이지 않음", () => {
  for (const [blocks, expected] of [
    [[], [["10:00", "12:00", ""]]],
    [[["10:00", "10:30"]], [["10:30", "12:00", "중간 합류"]]],
    [[["11:30", "12:00"]], [["10:00", "11:30", "중간 이탈"]]],
    [
      [
        ["10:00", "10:30"],
        ["11:30", "12:00"],
      ],
      [["10:30", "11:30", "중간 합류 · 중간 이탈"]],
    ],
    [
      [["10:30", "11:00"]],
      [
        ["10:00", "10:30", "중간 이탈"],
        ["11:00", "12:00", "중간 합류"],
      ],
    ],
  ]) {
    const trip = participationTrip([
      { id: "common", endTime: "12:00" },
      ...blocks.map(([startTime, endTime], index) => ({
        id: `party-${index}`,
        partyId: "cafe",
        startTime,
        endTime,
      })),
    ]);
    const agenda = getEffectiveAgenda(trip, "2026-09-19", "cafe");
    assert.deepEqual(
      agenda
        .filter((item) => item.id === "common")
        .map((item) => [
          item.startTime,
          item.endTime,
          participationLabel(item),
        ]),
      expected,
    );
    for (const item of agenda.filter((item) => item.partyId)) {
      assert.equal(participationLabel(item), "");
    }
  }
});

test("같은 파티의 겹치거나 인접한 일정은 합쳐서 제외하고 떨어진 구간 사이의 공통 참여는 유지", () => {
  const trip = participationTrip([
    { id: "common", startTime: "09:00", endTime: "15:00" },
    { id: "overlap", partyId: "cafe", startTime: "11:00", endTime: "12:30" },
    { id: "first", partyId: "cafe", startTime: "09:30", endTime: "10:00" },
    { id: "adjacent", partyId: "cafe", startTime: "10:00", endTime: "11:00" },
    {
      id: "overlap-two",
      partyId: "cafe",
      startTime: "12:00",
      endTime: "13:00",
    },
    { id: "separate", partyId: "cafe", startTime: "14:00", endTime: "14:30" },
  ]);
  const agenda = getEffectiveAgenda(trip, "2026-09-19", "cafe");
  assert.deepEqual(participationWindows(agenda, "common"), [
    ["09:00", "09:30"],
    ["13:00", "14:00"],
    ["14:30", "15:00"],
  ]);
  assert.equal(agenda.filter((item) => item.partyId === "cafe").length, 5);
  assert.equal(
    new Set(agenda.map((item) => item.occurrenceId)).size,
    agenda.length,
  );
  assert.deepEqual(
    getEffectiveAgenda(
      { ...trip, agenda: [...trip.agenda].reverse() },
      "2026-09-19",
      "cafe",
    ),
    agenda,
  );
});

test("다른 날짜와 다른 파티 일정은 선택한 파티의 공통 참여 시간을 바꾸지 않음", () => {
  const trip = participationTrip([
    { id: "common" },
    { id: "other-party", partyId: "beach" },
    { id: "next-day-party", partyId: "cafe", date: "2026-09-20" },
    { id: "next-day-common", date: "2026-09-20" },
  ]);
  assert.deepEqual(
    getEffectiveAgenda(trip, "2026-09-19", "cafe").map((item) => [
      item.id,
      item.startTime,
      item.endTime,
    ]),
    [["common", "10:00", "11:00"]],
  );
  assert.deepEqual(
    getEffectiveAgenda(trip, "2026-09-19", "beach").map((item) => item.id),
    ["other-party"],
  );
  assert.deepEqual(
    getEffectiveAgenda(trip, "2026-09-20", "cafe").map((item) => item.id),
    ["next-day-party"],
  );
  assert.deepEqual(getEffectiveAgenda(trip, "2026-09-21", "cafe"), []);
});

test("파티 미선택과 전체 일정 탭은 실제 등록된 공통 일정 시간을 그대로 유지", () => {
  const trip = participationTrip([
    { id: "common", endTime: "12:00" },
    { id: "party", partyId: "cafe", startTime: "10:30", endTime: "11:00" },
    {
      id: "other-party",
      partyId: "beach",
      startTime: "11:00",
      endTime: "12:00",
    },
  ]);
  const before = structuredClone(trip);
  const original = getEffectiveAgenda(trip, "2026-09-19", null);
  assert.equal(original.length, 3);
  for (const item of original) {
    const stored = trip.agenda.find((source) => source.id === item.id);
    assert.equal(item.startTime, stored.startTime);
    assert.equal(item.endTime, stored.endTime);
    assert.equal(item.originalStartTime, stored.startTime);
    assert.equal(item.originalEndTime, stored.endTime);
  }
  const commonOnlyTrip = {
    ...trip,
    agenda: trip.agenda.filter((item) => !item.partyId),
  };
  const commonRoute = buildDayRoute(commonOnlyTrip, "2026-09-19", null);
  assert.deepEqual(participationWindows(commonRoute.agenda, "common"), [
    ["10:00", "12:00"],
  ]);
  assert.equal(commonRoute.stops.length, 1);
  assert.deepEqual(trip, before);
});

test("시간이 미정이거나 잘못된 기존 일정은 보존하고 해당 파티 시간은 공통 일정을 가리지 않음", () => {
  const preserved = [
    { id: "empty", startTime: "", endTime: "" },
    { id: "missing-end", startTime: "10:00", endTime: "" },
    { id: "invalid", startTime: "25:00", endTime: "26:00" },
    { id: "reversed", startTime: "11:00", endTime: "10:00" },
  ];
  const trip = participationTrip([
    { id: "common" },
    ...preserved,
    ...preserved.map((item) => ({
      ...item,
      id: `party-${item.id}`,
      partyId: "cafe",
    })),
    { id: "party-zero", partyId: "cafe", startTime: "10:30", endTime: "10:30" },
  ]);
  const agenda = getEffectiveAgenda(trip, "2026-09-19", "cafe");
  assert.deepEqual(participationWindows(agenda, "common"), [
    ["10:00", "11:00"],
  ]);
  assert.equal(agenda.length, trip.agenda.length);
  for (const stored of trip.agenda) {
    assert.deepEqual(participationWindows(agenda, stored.id), [
      [stored.startTime, stored.endTime],
    ]);
  }
});

test("0분 파티 일정은 공통 시간을 가리지 않고 공통 순간 일정은 시작 포함·종료 제외로 계산", () => {
  const trip = participationTrip([
    { id: "common-before", startTime: "09:59", endTime: "09:59" },
    { id: "common-start", startTime: "10:00", endTime: "10:00" },
    { id: "common-inside", startTime: "10:30", endTime: "10:30" },
    { id: "common-end", startTime: "11:00", endTime: "11:00" },
    { id: "common-after", startTime: "11:01", endTime: "11:01" },
    { id: "party", partyId: "cafe" },
    { id: "party-zero", partyId: "cafe", startTime: "11:00", endTime: "11:00" },
  ]);
  const agenda = getEffectiveAgenda(trip, "2026-09-19", "cafe");
  assert.deepEqual(
    agenda.filter((item) => !item.partyId).map((item) => item.id),
    ["common-before", "common-end", "common-after"],
  );
  assert.deepEqual(participationWindows(agenda, "party-zero"), [
    ["11:00", "11:00"],
  ]);
});

test("공통 일정 이탈·복귀 지도는 계산한 시간과 고유 구간 키를 사용하며 원본 수정 ID는 유지", () => {
  const trip = participationTrip([
    { id: "common", endTime: "12:00", placeId: "p1" },
    {
      id: "party",
      partyId: "cafe",
      startTime: "10:30",
      endTime: "11:00",
      placeId: "p3",
    },
    {
      id: "other-party",
      partyId: "beach",
      startTime: "10:30",
      endTime: "11:00",
      placeId: "p4",
    },
    { id: "later", startTime: "12:15", endTime: "13:00", placeId: "p2" },
  ]);
  const before = structuredClone(trip);
  const route = buildDayRoute(trip, "2026-09-19", "cafe");
  assert.deepEqual(
    route.agenda,
    getEffectiveAgenda(trip, "2026-09-19", "cafe"),
  );
  assert.deepEqual(
    route.stops.map((stop) => stop.agenda.id),
    ["common", "party", "common", "later"],
  );
  assert.deepEqual(
    route.stops.map((stop) => stop.number),
    [1, 2, 3, 4],
  );
  assert.equal(route.located.length, 4);
  assert.equal(new Set(route.stops.map((stop) => stop.key)).size, 4);
  for (const stop of route.stops) {
    assert.equal(stop.key, stop.agenda.occurrenceId);
    assert.ok(trip.agenda.some((item) => item.id === stop.agenda.id));
  }
  assert.deepEqual(
    route.segments.map((segment) => [
      segment.from.agenda.id,
      segment.from.agenda.endTime,
      segment.to.agenda.id,
      segment.to.agenda.startTime,
    ]),
    [
      ["common", "10:30", "party", "10:30"],
      ["party", "11:00", "common", "11:00"],
      ["common", "12:00", "later", "12:15"],
    ],
  );
  assert.deepEqual(
    route.segments.map((segment) => segment.partyId),
    ["cafe", "cafe", null],
  );
  assert.equal(
    new Set(
      route.segments.map((segment) => `${segment.from.key}:${segment.to.key}`),
    ).size,
    3,
  );
  assert.deepEqual(trip, before);
});

test("완전히 가려진 공통 일정은 지도 핀에서도 제외하고 겹친 파티 일정끼리는 동선을 연결하지 않음", () => {
  const covered = participationTrip([
    { id: "common", placeId: "p1" },
    { id: "party", partyId: "cafe", placeId: "p3" },
  ]);
  const coveredRoute = buildDayRoute(covered, "2026-09-19", "cafe");
  assert.deepEqual(
    coveredRoute.stops.map((stop) => stop.place.id),
    ["p3"],
  );
  assert.equal(coveredRoute.segments.length, 0);

  const overlapping = participationTrip([
    { id: "common", startTime: "09:00", endTime: "14:00", placeId: "p1" },
    {
      id: "party-one",
      partyId: "cafe",
      startTime: "10:00",
      endTime: "12:00",
      placeId: "p3",
    },
    {
      id: "party-two",
      partyId: "cafe",
      startTime: "11:00",
      endTime: "13:00",
      placeId: "p2",
    },
  ]);
  const overlappingRoute = buildDayRoute(overlapping, "2026-09-19", "cafe");
  assert.deepEqual(participationWindows(overlappingRoute.agenda, "common"), [
    ["09:00", "10:00"],
    ["13:00", "14:00"],
  ]);
  assert.deepEqual(
    overlappingRoute.segments.map((segment) => [
      segment.from.agenda.id,
      segment.to.agenda.id,
    ]),
    [
      ["common", "party-one"],
      ["party-two", "common"],
    ],
  );
});
test("일정은 날짜·시간 순으로 정렬하고 시간 미정은 마지막에 두며 같은 시간의 큰 DB ID 순서를 보존", () => {
  const base = seed().trips[0].agenda[0];
  const agenda = [
    { ...base, id: "90071992547409930", startTime: "09:00" },
    { ...base, id: "1", startTime: "", endTime: "" },
    { ...base, id: "next-day", date: "2026-09-20", startTime: "00:00" },
    { ...base, id: "10", startTime: "09:00" },
    { ...base, id: "2", startTime: "09:00" },
    { ...base, id: "earlier-time", startTime: "08:00" },
    { ...base, id: "9007199254740994", startTime: "09:00" },
  ];
  assert.deepEqual(
    agenda.sort(compareAgenda).map((item) => item.id),
    [
      "earlier-time",
      "2",
      "10",
      "9007199254740994",
      "90071992547409930",
      "1",
      "next-day",
    ],
  );
});

test("시간이 비어 있는 기존 일정의 지도 핀은 유지하며 동선 구간을 임의로 연결하지 않음", () => {
  const trip = seed().trips[0];
  const base = trip.agenda[0];
  trip.parties = [];
  trip.agenda = [
    {
      ...base,
      id: "1",
      startTime: "09:00",
      endTime: "10:00",
      placeId: "p1",
      partyId: null,
    },
    {
      ...base,
      id: "2",
      startTime: "11:00",
      endTime: "",
      placeId: "p2",
      partyId: null,
    },
    {
      ...base,
      id: "3",
      startTime: "12:00",
      endTime: "13:00",
      placeId: "p1",
      partyId: null,
    },
    {
      ...base,
      id: "4",
      startTime: "",
      endTime: "",
      placeId: "p2",
      partyId: null,
    },
  ];
  const route = buildDayRoute(trip, base.date, null);
  assert.equal(route.located.length, 4);
  assert.equal(route.segments.length, 0);
  assert.equal(route.stops.at(-1).agenda.id, "4");
});

test("기존 저장 데이터에는 수정하지 않은 샘플 장소의 좌표만 보완", async () => {
  const old = seed();
  old.trips[0].places.forEach((p) => delete p.coordinates);
  old.trips[0].places[1].coordinates = null;
  old.trips[0].places[2].address = "사용자가 바꾼 주소";
  old.trips[0].agenda[0].note = "보존해야 할 메모";
  const snapshot = JSON.stringify(old);
  const migrated = addSeedCoordinates(old);
  assert.ok(validCoordinates(migrated.trips[0].places[0].coordinates));
  assert.equal(migrated.trips[0].places[1].coordinates, null);
  assert.equal(migrated.trips[0].places[2].coordinates, undefined);
  assert.equal(migrated.trips[0].agenda[0].note, "보존해야 할 메모");
  assert.equal(JSON.stringify(old), snapshot);
  assert.deepEqual(addSeedCoordinates(migrated), migrated);
  const storage = new MemoryStorage();
  await storage.write("workspace-v1", snapshot);
  const repo = new MockTravelRepository(storage);
  await repo.signIn(SAMPLE_EMAIL);
  const place = (await repo.load()).trips[0].places[0];
  await repo.execute(
    save("places", {
      ...place,
      coordinates: { latitude: 0, longitude: -73.2 },
    }),
  );
  const restored = new MockTravelRepository(storage);
  await restored.restoreSession();
  assert.deepEqual((await restored.load()).trips[0].places[0].coordinates, {
    latitude: 0,
    longitude: -73.2,
  });
});
test("지도 투영은 왕복 좌표를 보존하고 320px/390px에서 모든 위치를 화면 안에 맞춤", () => {
  const coordinates = seed().trips[0].places.map((p) => p.coordinates);
  for (const point of [
    ...coordinates,
    { latitude: 0, longitude: 0 },
    { latitude: -40, longitude: -73 },
  ]) {
    const restored = unproject(project(point));
    assert.ok(Math.abs(restored.latitude - point.latitude) < 1e-7);
    assert.ok(Math.abs(restored.longitude - point.longitude) < 1e-7);
  }
  for (const width of [278, 348, 458]) {
    const camera = fitCamera(coordinates, width, 280);
    for (const point of coordinates) {
      const pixel = screenPoint(point, camera, width, 280);
      assert.ok(pixel.x >= 47 && pixel.x <= width - 47);
      assert.ok(pixel.y >= 47 && pixel.y <= 233);
    }
    const tiles = visibleTiles(camera, width, 280);
    assert.ok(tiles.length > 0 && tiles.length <= 9);
    assert.ok(
      tiles.every(
        (t) =>
          t.x >= 0 &&
          t.x < 2 ** camera.zoom &&
          t.y >= 0 &&
          t.y < 2 ** camera.zoom,
      ),
    );
  }
});
test("날짜 변경선과 단일 장소에서도 유한한 줌과 유효한 지도 타일 사용", () => {
  const points = [
    { latitude: 10, longitude: 179.9 },
    { latitude: 10, longitude: -179.9 },
  ];
  const camera = fitCamera(points, 300, 280);
  assert.ok(camera.zoom > 7);
  points.forEach((point) =>
    assert.ok(Math.abs(screenPoint(point, camera, 300, 280).x - 150) < 110),
  );
  assert.equal(fitCamera([points[0]], 300, 280).zoom, 16);
  for (const latitude of [-90, 90]) {
    const polar = fitCamera([{ latitude, longitude: 180 }], 300, 280);
    assert.ok(Number.isFinite(polar.center.y));
    assert.ok(
      visibleTiles(polar, 300, 280).every(
        (t) => t.y >= 0 && t.y < 2 ** polar.zoom,
      ),
    );
  }
});
test("날짜 검증: 윤년, 잘못된 달력 날짜, 역순, 90일 한도", () => {
  assert.deepEqual(datesBetween("2024-02-28", "2024-03-01"), [
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
  ]);
  for (const [start, end] of [
    ["2026-02-29", "2026-03-01"],
    ["2026-09-21", "2026-09-19"],
    ["2026-01-01", "2026-12-31"],
  ])
    assert.deepEqual(datesBetween(start, end), []);
});
test("균등 분할은 원 단위 잔액을 보존하며 중복 멤버와 소수를 거절", () => {
  assert.deepEqual(equalShares(100, ["a", "b", "c"]), { a: 34, b: 33, c: 33 });
  assert.deepEqual(equalShares(2, ["a", "b", "c"]), { a: 1, b: 1, c: 0 });
  assert.throws(() => equalShares(1.5, ["a"]));
  assert.throws(() => equalShares(10, ["a", "a"]));
});
test("송금 계획 실행 후 모든 순잔액이 0원이 됨", () => {
  const trip = seed().trips[0];
  trip.expenses.push(
    expense({
      id: "custom",
      amount: 10001,
      payerId: "doyoon",
      shares: { jiwoo: 1000, minsu: 2000, seoyeon: 3000, doyoon: 4001 },
    }),
  );
  const result = calculateSettlement(trip);
  assert.equal(result.total, 594001);
  const balances = Object.fromEntries(
    Object.entries(result.balances).map(([id, b]) => [id, b.balance]),
  );
  for (const t of result.transfers) {
    assert.ok(Number.isSafeInteger(t.amount) && t.amount > 0);
    balances[t.from] += t.amount;
    balances[t.to] -= t.amount;
  }
  assert.ok(Object.values(balances).every((n) => n === 0));
});
test("명령은 원본 데이터와 입력 항목을 변경하지 않고 작성자 위조를 차단", () => {
  const before = seed();
  const snapshot = JSON.stringify(before);
  const command = save("messages", {
    id: "new",
    text: "우리 여행!",
    authorId: "minsu",
    createdAt: "invalid",
  });
  const next = applyCommand(before, "jiwoo", command);
  assert.equal(JSON.stringify(before), snapshot);
  assert.equal(command.item.authorId, "minsu");
  assert.equal(next.trips[0].messages.at(-1).authorId, "jiwoo");
  command.item.text = "changed outside";
  assert.equal(next.trips[0].messages.at(-1).text, "우리 여행!");
});
test("비멤버 접근과 일반 멤버의 여행장 권한 사용 차단", () => {
  assert.throws(
    () => applyCommand(seed(), "haneul", save("expenses", expense())),
    /접근/,
  );
  assert.throws(() => applyCommand(seed(), "minsu", update()), /여행장/);
  assert.throws(
    () =>
      applyCommand(seed(), "minsu", {
        type: "trip.invite",
        tripId: "busan",
        userId: "haneul",
      }),
    /여행장/,
  );
});
test("초대 코드는 대소문자와 공백을 정규화하고 중복 참여를 차단", () => {
  const joined = applyCommand(seed(), "haneul", {
    type: "trip.join",
    code: " busan26 ",
  });
  assert.ok(joined.trips[0].memberIds.includes("haneul"));
  assert.throws(
    () =>
      applyCommand(joined, "haneul", { type: "trip.join", code: "BUSAN26" }),
    /이미/,
  );
  const archived = applyCommand(seed(), "jiwoo", update({ archived: true }));
  assert.throws(() =>
    applyCommand(archived, "haneul", { type: "trip.join", code: "BUSAN26" }),
  );
  assert.throws(() =>
    applyCommand(archived, "jiwoo", {
      type: "trip.invite",
      tripId: "busan",
      userId: "haneul",
    }),
  );
});
test("새 여행에 생성자를 포함하고 멤버 중복을 제거", () => {
  const next = applyCommand(seed(), "jiwoo", {
    type: "trip.create",
    input: { ...update().input, memberIds: ["jiwoo", "minsu", "minsu"] },
  });
  assert.deepEqual(next.trips[0].memberIds, ["jiwoo", "minsu"]);
  assert.equal(next.trips[0].ownerId, "jiwoo");
  assert.ok(next.trips[0].inviteCode);
});
test("소그룹 일정은 여행 기간 안에서 날짜와 시간을 자유롭게 선택", () => {
  const agenda = seed().trips[0].agenda[2];
  const next = applyCommand(
    seed(),
    "jiwoo",
    save("agenda", {
      ...agenda,
      date: "2026-09-20",
      startTime: "09:00",
      endTime: "10:00",
    }),
  );
  assert.equal(
    next.trips[0].agenda.find((a) => a.id === agenda.id).date,
    "2026-09-20",
  );
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("agenda", { ...agenda, partyId: "missing" }),
      ),
    /파티/,
  );
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("agenda", { ...agenda, date: "2026-09-25" }),
      ),
    /날짜/,
  );
  assert.throws(
    () => applyCommand(seed(), "jiwoo", update({ startDate: "2026-09-20" })),
    /기존/,
  );
  const party = { id: "new-group", name: "산책팀", memberIds: ["jiwoo"] };
  assert.deepEqual(
    applyCommand(seed(), "jiwoo", save("parties", party)).trips[0].parties.at(
      -1,
    ),
    party,
  );
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("parties", { ...party, name: "x".repeat(51) }),
      ),
    /파티/,
  );
  const withoutAgenda = seed();
  withoutAgenda.trips[0].agenda = [];
  assert.doesNotThrow(() =>
    applyCommand(withoutAgenda, "jiwoo", update({ startDate: "2026-09-20" })),
  );
});
test("지출 합계와 분담 멤버를 검증하며 파티 변경이 과거 분담에 영향 없음", () => {
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("expenses", expense({ shares: { jiwoo: 1 } })),
      ),
    /합계/,
  );
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("expenses", expense({ shares: { haneul: 360000 } })),
      ),
    /멤버/,
  );
  assert.throws(
    () =>
      applyCommand(seed(), "jiwoo", save("expenses", expense({ amount: NaN }))),
    /금액/,
  );
  let data = applyCommand(
    seed(),
    "jiwoo",
    save("expenses", expense({ partyId: "cafe" })),
  );
  const shares = { ...data.trips[0].expenses[0].shares };
  data = applyCommand(
    data,
    "jiwoo",
    save("parties", { ...data.trips[0].parties[0], memberIds: ["jiwoo"] }),
  );
  assert.deepEqual(data.trips[0].expenses[0].shares, shares);
});
test("송금을 받는 사람만 완료 기록과 취소 가능, 지출 변경 시 완료 기록 초기화", () => {
  const t = calculateSettlement(seed().trips[0]).transfers[0];
  const outsider = seed().trips[0].memberIds.find(
    (id) => ![t.from, t.to].includes(id),
  );
  const confirm = {
    type: "transfer.confirm",
    tripId: "busan",
    transferKey: t.key,
  };
  assert.throws(() => applyCommand(seed(), outsider, confirm), /받는 사람/);
  assert.throws(() => applyCommand(seed(), t.from, confirm), /받는 사람/);
  const confirmed = applyCommand(seed(), t.to, confirm);
  assert.deepEqual(confirmed.trips[0].confirmedTransfers, [t.key]);
  assert.throws(() => applyCommand(confirmed, t.from, confirm), /받는 사람/);
  assert.throws(() => applyCommand(confirmed, outsider, confirm), /받는 사람/);
  assert.deepEqual(
    applyCommand(confirmed, t.to, confirm).trips[0].confirmedTransfers,
    [],
  );
  assert.deepEqual(
    applyCommand(confirmed, "jiwoo", save("expenses", expense())).trips[0]
      .confirmedTransfers,
    [],
  );
});
test("연결된 장소/파티 삭제와 타인의 공지 수정 차단", () => {
  for (const [collection, itemId] of [
    ["places", "p1"],
    ["parties", "cafe"],
  ])
    assert.throws(
      () =>
        applyCommand(seed(), "jiwoo", {
          type: "item.delete",
          tripId: "busan",
          collection,
          itemId,
        }),
      /연결/,
    );
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "minsu",
        save("notices", seed().trips[0].notices[0]),
      ),
    /여행장/,
  );
});
test("변경 알림은 다른 멤버에게 전달되며 일정 삭제도 schedule 경로 사용", () => {
  const next = applyCommand(seed(), "jiwoo", {
    type: "item.delete",
    tripId: "busan",
    collection: "agenda",
    itemId: "a1",
  });
  const added = next.notifications.filter((n) => n.id !== "nt1");
  assert.equal(added.length, 3);
  assert.ok(
    added.every((n) => n.userId !== "jiwoo" && n.section === "schedule"),
  );
});
test("배정된 준비물은 담당자만 체크·취소하고 담당자 없는 항목은 배정 필요", () => {
  const original = seed();
  const [owner, other] = original.trips[0].memberIds;
  original.trips[0].checklist = [
    { id: "assigned", title: "여권", ownerId: owner, done: false },
    { id: "common", title: "공용 구급상자", ownerId: null, done: false },
  ];
  const command = {
    type: "checklist.complete",
    tripId: original.trips[0].id,
    itemId: "assigned",
    done: true,
  };
  for (const done of [true, false])
    assert.throws(
      () => applyCommand(original, other, { ...command, done }),
      /담당자만/,
    );
  const checked = applyCommand(original, owner, command);
  assert.equal(checked.trips[0].checklist[0].done, true);
  for (const done of [true, false])
    assert.throws(
      () => applyCommand(checked, other, { ...command, done }),
      /담당자만/,
    );
  assert.equal(original.trips[0].checklist[0].done, false);
  assert.equal(checked.trips[0].checklist[0].done, true);
  const undone = applyCommand(checked, owner, { ...command, done: false });
  assert.equal(undone.trips[0].checklist[0].done, false);
  for (const member of original.trips[0].memberIds)
    for (const done of [true, false])
      assert.throws(
        () =>
          applyCommand(undone, member, { ...command, itemId: "common", done }),
        /담당자가 없는/,
      );
});

test("Mock all-member packing creates separate incomplete items and preserves each person's independent status", () => {
  const original = seed();
  original.trips[0].checklist = [];
  const members = original.trips[0].memberIds;
  const command = save("checklist", {
    id: "all-passports",
    title: "  여권  ",
    ownerId: null,
    done: true,
  });
  const created = applyCommand(original, members[0], command);
  const items = created.trips[0].checklist;
  assert.equal(items.length, members.length);
  assert.equal(new Set(items.map((item) => item.id)).size, members.length);
  assert.deepEqual(
    items.map((item) => item.ownerId),
    members,
  );
  assert.ok(
    items.every((item) => item.title === "여권" && item.done === false),
  );
  const own = items.find((item) => item.ownerId === members[0]);
  const checked = applyCommand(created, members[0], {
    type: "checklist.complete",
    tripId: "busan",
    itemId: own.id,
    done: true,
  });
  assert.equal(
    checked.trips[0].checklist.filter((item) => item.done).length,
    1,
  );
  assert.throws(
    () =>
      applyCommand(checked, members[1], {
        type: "checklist.complete",
        tripId: "busan",
        itemId: own.id,
        done: false,
      }),
    /담당자만/,
  );
  const replayed = applyCommand(checked, members[0], command);
  assert.deepEqual(replayed.trips[0].checklist, checked.trips[0].checklist);
  const edited = applyCommand(
    checked,
    members[0],
    save("checklist", { ...own, title: "내 여권", done: false }),
  );
  assert.equal(
    edited.trips[0].checklist.find((item) => item.id === own.id).done,
    true,
  );
  assert.ok(
    edited.trips[0].checklist
      .filter((item) => item.id !== own.id)
      .every((item) => item.title === "여권" && !item.done),
  );
  assert.throws(
    () =>
      applyCommand(
        edited,
        members[0],
        save("checklist", { ...own, ownerId: null }),
      ),
    /담당자를 선택/,
  );
});

test("Mock unassigned completion is not attributed to a newly assigned member", () => {
  const original = seed();
  original.trips[0].checklist = [
    { id: "legacy", title: "이전 여권", ownerId: null, done: true },
  ];
  const assigned = applyCommand(
    original,
    "jiwoo",
    save("checklist", { ...original.trips[0].checklist[0], ownerId: "jiwoo" }),
  );
  assert.equal(assigned.trips[0].checklist[0].done, false);
  assert.equal(original.trips[0].checklist[0].done, true);
});

test("로컬 저장소 재생성 후 세션과 체크리스트 복원", async () => {
  const storage = new MemoryStorage();
  const first = new MockTravelRepository(storage);
  await first.signIn(SAMPLE_EMAIL);
  await first.execute(
    save("checklist", {
      id: "persist",
      title: "카메라",
      ownerId: "jiwoo",
      done: false,
    }),
  );
  await first.execute({
    type: "checklist.complete",
    tripId: "busan",
    itemId: "persist",
    done: true,
  });
  const second = new MockTravelRepository(storage);
  assert.equal((await second.restoreSession()).user.id, "jiwoo");
  assert.ok(
    (await second.load()).trips[0].checklist.find((c) => c.id === "persist")
      .done,
  );
  await second.signOut();
  assert.equal(await new MockTravelRepository(storage).restoreSession(), null);
});
test("동시 저장 명령을 직렬화하고 저장 실패 후 다음 명령을 처리", async () => {
  const storage = new MemoryStorage();
  const repo = new MockTravelRepository(storage);
  await repo.signIn(SAMPLE_EMAIL);
  await Promise.all(
    ["one", "two"].map((id) =>
      repo.execute(
        save("checklist", { id, title: id, ownerId: "jiwoo", done: false }),
      ),
    ),
  );
  assert.equal((await repo.load()).trips[0].checklist.length, 7);
  storage.fail = true;
  await assert.rejects(
    repo.execute(
      save("checklist", {
        id: "failed",
        title: "failed",
        ownerId: null,
        done: false,
      }),
    ),
    /저장 공간/,
  );
  storage.fail = false;
  assert.equal((await repo.load()).trips[0].checklist.length, 7);
  await repo.execute(
    save("checklist", {
      id: "recover",
      title: "recover",
      ownerId: "jiwoo",
      done: false,
    }),
  );
  assert.equal((await repo.load()).trips[0].checklist.length, 8);
});
test("새 프로필은 자기 여행만 보며 초대 코드로 기존 여행에 참여", async () => {
  const repo = new MockTravelRepository(new MemoryStorage());
  await repo.signUp("새 친구", "friend@example.com");
  assert.equal((await repo.load()).trips.length, 0);
  assert.equal((await repo.load()).notifications.length, 0);
  await repo.execute({ type: "trip.join", code: "BUSAN26" });
  assert.equal((await repo.load()).trips.length, 1);
  await assert.rejects(repo.signUp("중복", "friend@example.com"), /이미/);
});
test("HTTP 어댑터의 인증 헤더, 명령 응답, 오류 처리와 로그아웃", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const calls = [];
  const responses = [
    { body: { user: seed().users[0], token: "test-access" } },
    { body: seed() },
    { body: { message: "여행 권한 없음" }, status: 403 },
    { status: 204 },
  ];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    const r = responses.shift();
    return new Response(r.status === 204 ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
    });
  };
  const repo = new HttpTravelRepository("https://api.example.test/api/");
  assert.equal(await repo.restoreSession(), null);
  await repo.signIn("user@example.com", "test-password");
  const command = save("checklist", {
    id: "test",
    title: "test",
    ownerId: null,
    done: false,
  });
  assert.equal((await repo.execute(command)).version, 1);
  assert.equal(calls[1].url, "https://api.example.test/api/commands");
  assert.equal(calls[1].headers.Authorization, "Bearer test-access");
  assert.deepEqual(JSON.parse(calls[1].body).command, command);
  assert.ok(JSON.parse(calls[1].body).commandId);
  await assert.rejects(repo.load(), /여행 권한 없음/);
  await repo.signOut();
  assert.equal(calls.length, 4);
});

test("USER API unwraps envelopes, sends bearer and preserves PATCH null semantics", async (t) => {
  const { UserApi, ApiError } = require("../src/data/user-api.ts");
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const api = new UserApi("http://localhost:8080/api/");
  api.token = "test-token";
  let sent;
  global.fetch = async (url, options) => {
    sent = { url, ...options };
    return new Response(
      JSON.stringify({ code: "SUCCESS", data: { id: "1", name: "수정" } }),
    );
  };
  assert.equal((await api.updateProfile({ name: "수정" })).name, "수정");
  assert.equal(sent.url, "http://localhost:8080/api/v1/users/me");
  assert.equal(sent.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(sent.body), { name: "수정" });
  await api.updateProfile({ bankAccountNumber: null });
  assert.deepEqual(JSON.parse(sent.body), { bankAccountNumber: null });
  global.fetch = async () =>
    new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "만료" }), {
      status: 401,
    });
  await assert.rejects(
    api.me(),
    (e) => e instanceof ApiError && e.status === 401,
  );
  api.token = "test-token";
  await assert.rejects(api.logout());
  assert.equal(api.token, null);
});

test("Server accounts ignore legacy local travel and never persist bearer credentials", async (t) => {
  const {
    UserTravelRepository,
  } = require("../src/data/user-travel-repository.ts");
  const saved = new Map();
  const storage = {
    read: async (k) => saved.get(k) ?? null,
    write: async (k, v) => saved.set(k, v),
    remove: async (k) => saved.delete(k),
  };
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let id = "1";
  global.fetch = async (url) =>
    new Response(
      JSON.stringify({
        code: "SUCCESS",
        data: url.endsWith("/login")
          ? { accessToken: "private-token" }
          : url.endsWith("/logout")
            ? null
            : url.includes("/trips?") || url.includes("/friends?")
              ? { items: [], nextCursor: null }
              : { id, name: "테스트", email: "test@example.com" },
      }),
    );
  const repo = new UserTravelRepository("http://localhost:8080/api", storage);
  await repo.signIn("test@example.com", "password");
  assert.equal((await repo.load()).users[0].id, "1");
  saved.set(
    "server-user-1-workspace-v1",
    JSON.stringify({
      version: 1,
      users: [],
      trips: [{ id: "owned" }],
      friendships: {},
      notifications: [],
    }),
  );
  assert.deepEqual((await repo.load()).trips, []);
  await repo.signOut();
  id = "2";
  await repo.signIn("other@example.com", "password");
  assert.deepEqual((await repo.load()).trips, []);
  assert.ok(
    [...saved.values()].every((value) => !value.includes("private-token")),
  );
  assert.equal(
    await new UserTravelRepository(
      "http://localhost:8080/api",
      storage,
    ).restoreSession(),
    null,
  );
});

test("Trip API paginates and creation retains its idempotency key through access refresh", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const { TripApi } = require("../src/data/trip-api.ts");
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const api = new UserApi("http://localhost:8080/api", {
    kind: "NATIVE",
    read: async () => "refresh",
    write: async () => {},
    clear: async () => {},
  });
  api.token = "old";
  const trips = new TripApi(api);
  const creates = [];
  global.fetch = async (url, options) => {
    let data;
    if (url.includes("/auth/tokens/refresh"))
      data = { accessToken: "new", refreshToken: "rotated" };
    else if (options.method === "POST") {
      creates.push(options.headers["Idempotency-Key"]);
      if (options.headers.Authorization === "Bearer old")
        return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
          status: 401,
        });
      data = { trip: { id: "42" }, invitations: [] };
    } else
      data = url.includes("cursor=")
        ? { items: [{ id: "2" }], nextCursor: null }
        : { items: [{ id: "1" }], nextCursor: "opaque+/=" };
    return new Response(JSON.stringify({ code: "SUCCESS", data }));
  };
  assert.deepEqual(await trips.all("/trips?status=ALL"), [
    { id: "1" },
    { id: "2" },
  ]);
  assert.equal(
    (
      await trips.create(
        {
          title: "Trip",
          destination: "Busan",
          startDate: "2026-10-10",
          endDate: "2026-10-11",
          budget: 0,
          inviteeIds: [],
        },
        "stable-request-key",
      )
    ).trip.id,
    "42",
  );
  assert.deepEqual(creates, ["stable-request-key", "stable-request-key"]);
});

test("Server workspace reads memberships and accepted friends, not local history", async (t) => {
  const {
    UserTravelRepository,
  } = require("../src/data/user-travel-repository.ts");
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let storageReads = 0;
  const repo = new UserTravelRepository("http://localhost:8080/api", {
    read: async (key) => {
      storageReads++;
      assert.ok(key.startsWith("trip-device-notes-v1:"));
      return null;
    },
    write: async () => assert.fail("server data must not be persisted locally"),
    remove: async () => {},
  });
  global.fetch = async (url) => {
    const trip = {
      id: "91",
      title: "Shared",
      destination: "Busan",
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      budget: 0,
      status: "ACTIVE",
      owner: { id: "1", name: "Owner" },
    };
    const data = url.endsWith("/login")
      ? { accessToken: "secret" }
      : url.endsWith("/users/me")
        ? { id: "1", name: "Owner", email: "me@example.invalid" }
        : url.includes("/members?")
          ? {
              items: [
                { user: { id: "1", name: "Owner" }, role: "OWNER" },
                { user: { id: "2", name: "Friend" }, role: "MEMBER" },
              ],
              nextCursor: null,
            }
          : url.includes("/friends?")
            ? {
                items: [{ user: { id: "2", name: "Friend" } }],
                nextCursor: null,
              }
            : url.includes("/parties?")
              ? {
                  items: [{ id: "301", name: "카페팀", memberIds: ["1", "2"] }],
                  nextCursor: null,
                }
              : url.includes("/expenses?")
                ? { items: [], nextCursor: null, settlementRevision: "0" }
                : url.includes("/packing-items?")
                  ? {
                      items: [],
                      nextCursor: null,
                      checklistStateToken: "a".repeat(64),
                    }
                  : url.endsWith("/settlement")
                    ? {
                        settlementRevision: "0",
                        total: 0,
                        balances: {},
                        transfers: [],
                      }
                    : url.includes("/saved-places?") ||
                        url.includes("/itinerary-items?") ||
                        url.includes("/notices?")
                      ? { items: [], nextCursor: null }
                      : { items: [trip], nextCursor: null };
    return new Response(JSON.stringify({ code: "SUCCESS", data }));
  };
  await repo.signIn("me@example.invalid", "dummy");
  const workspace = await repo.load();
  assert.equal(storageReads, 2);
  assert.deepEqual(workspace.trips[0].memberIds, ["1", "2"]);
  assert.deepEqual(workspace.friendships, { 1: ["2"] });
  assert.equal(workspace.users.find((u) => u.id === "2").email, "");
  assert.equal(workspace.trips[0].inviteCode, "");
  assert.deepEqual(workspace.trips[0].parties, [
    { id: "301", name: "카페팀", memberIds: ["1", "2"] },
  ]);
});

function restoredRepositoryFixture() {
  const {
    UserTravelRepository,
  } = require("../src/data/user-travel-repository.ts");
  const values = new Map(),
    calls = [];
  let account = "1";
  const repo = new UserTravelRepository("http://localhost:8080/api", {
    read: async (k) => values.get(k) ?? null,
    write: async (k, v) => values.set(k, v),
    remove: async (k) => values.delete(k),
  });
  const trip = {
    id: "91",
    title: "기존 여행",
    destination: "부산",
    startDate: "2026-10-10",
    endDate: "2026-10-12",
    budget: 0,
    status: "ACTIVE",
    owner: { id: "1", name: "여행장" },
    version: 3,
  };
  repo.userApi.login = async () => {
    repo.userApi.token = "memory-only";
  };
  repo.userApi.logout = async () => {
    repo.userApi.token = null;
  };
  repo.userApi.me = async () => ({
    id: account,
    name: `회원 ${account}`,
    email: `${account}@example.invalid`,
  });
  repo.tripApi.trips = async () => [structuredClone(trip)];
  repo.tripApi.parties = async () => [];
  repo.noticeApi.list = async () => [];
  repo.tripApi.savedPlaces = async () => [];
  repo.tripApi.itineraryItems = async () => [];
  repo.tripApi.packingItems = async () => ({
    items: [],
    checklistStateToken: "a".repeat(64),
  });
  repo.tripApi.expenses = async () => ({ items: [], settlementRevision: "0" });
  repo.tripApi.settlement = async () => ({
    settlementRevision: "0",
    total: 0,
    balances: {
      1: { paid: 0, share: 0, balance: 0 },
      2: { paid: 0, share: 0, balance: 0 },
    },
    transfers: [],
  });
  repo.tripApi.members = async () => [
    { user: { id: "1", name: "여행장" } },
    { user: { id: "2", name: "친구" } },
  ];
  repo.tripApi.friends = async () => [
    { user: { id: account === "1" ? "2" : "1", name: "친구" } },
  ];
  repo.tripApi.invite = async (...args) => calls.push(["invite", ...args]);
  repo.tripApi.requestFriend = async (...args) =>
    calls.push(["friend", ...args]);
  repo.tripApi.update = async (...args) => {
    calls.push(["update", ...args]);
  };
  return {
    repo,
    values,
    calls,
    trip,
    account: (value) => {
      account = value;
    },
  };
}
function noticeRepositoryFixture() {
  const f = restoredRepositoryFixture();
  const { ApiError } = require("../src/data/user-api.ts");
  const state = { items: [], calls: [], next: 9007199254740993n };
  const cached = new Map();
  f.repo.noticeApi.list = async () => structuredClone(state.items);
  for (const operation of ["create", "update", "remove"]) {
    f.repo.noticeApi[operation] = async (...args) => {
      const key = args.at(-1);
      state.calls.push([operation, ...structuredClone(args)]);
      if (cached.has(key)) return structuredClone(cached.get(key));
      let result;
      if (operation === "create") {
        const item = {
          ...args[1],
          id: String(state.next++),
          authorId: "1",
          authorName: "여행장",
          version: "0",
          createdAt: "2026-10-25T00:00:00Z",
          updatedAt: "2026-10-25T00:00:00Z",
        };
        state.items.unshift(item);
        result = item;
      } else {
        const item = state.items.find((item) => item.id === args[1]);
        if (!item)
          throw new ApiError(404, "NOTICE_NOT_FOUND", "삭제된 공지예요.");
        const version =
          operation === "update" ? args[2].expectedVersion : args[2];
        if (item.version !== version)
          throw new ApiError(409, "NOTICE_CONFLICT", "공지가 변경됐어요.");
        if (operation === "update") {
          const { expectedVersion, ...body } = args[2];
          Object.assign(item, body, {
            version: String(BigInt(item.version) + 1n),
          });
          result = item;
        } else {
          state.items = state.items.filter((row) => row !== item);
          result = { deletedId: item.id };
        }
      }
      cached.set(key, structuredClone(result));
      return structuredClone(result);
    };
  }
  return { ...f, noticeState: state };
}
const noticeDraft = (patch = {}) => ({
  id: "new-notice",
  title: "집합 안내",
  body: "로비에서 만나요",
  pinned: true,
  authorId: "1",
  createdAt: "2026-10-25T00:00:00Z",
  ...patch,
});

test("Shared notices survive account changes, enforce owner management and preserve legacy device originals", async () => {
  const { repo, values, account, noticeState } = noticeRepositoryFixture();
  const key = "trip-device-notes-v1:http%3A%2F%2Flocalhost%3A8080%2Fapi:1";
  const original = JSON.stringify({
    91: { notices: [noticeDraft({ title: "기기 원본" })] },
  });
  values.set(key, original);
  await repo.signIn("1@example.invalid", "dummy");
  const empty = await repo.load();
  assert.equal(empty.trips[0].notices.length, 0);
  assert.equal(empty.trips[0].legacyNoticesPreserved, true);
  let workspace = await repo.execute(planningSave("notices", noticeDraft()));
  const item = workspace.trips[0].notices[0];
  assert.equal(item.id, "9007199254740993");
  assert.equal(values.get(key), original);
  assert.equal(noticeState.calls[0][2].id, undefined);
  assert.equal(noticeState.calls[0][2].authorId, undefined);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  workspace = await repo.load();
  assert.equal(workspace.trips[0].notices[0].body, "로비에서 만나요");
  await assert.rejects(
    repo.execute(planningSave("notices", { ...item, title: "변경 시도" })),
    /여행장/,
  );
  await assert.rejects(
    repo.execute({
      type: "item.delete",
      tripId: "91",
      collection: "notices",
      itemId: item.id,
      expectedVersion: "0",
    }),
    /여행장/,
  );
  assert.equal(noticeState.calls.length, 1);
  await repo.signOut();
  account("1");
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  workspace = await repo.execute(
    planningSave("notices", { ...item, pinned: false }),
  );
  assert.equal(workspace.trips[0].notices[0].version, "1");
  await repo.execute({
    type: "item.delete",
    tripId: "91",
    collection: "notices",
    itemId: item.id,
    expectedVersion: "1",
  });
  assert.equal(noticeState.items.length, 0);
  assert.equal(values.get(key), original);
});

test("Notice conflicts publish the latest server state and do not overwrite it with a stale editor", async () => {
  const { repo, noticeState } = noticeRepositoryFixture();
  const {
    RepositoryConflictError,
  } = require("../src/data/user-travel-repository.ts");
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const item = (await repo.execute(planningSave("notices", noticeDraft())))
    .trips[0].notices[0];
  noticeState.items[0].version = "1";
  noticeState.items[0].title = "다른 창의 변경";
  await assert.rejects(
    repo.execute(planningSave("notices", { ...item, title: "오래된 입력" })),
    (error) => {
      assert.ok(error instanceof RepositoryConflictError);
      assert.equal(error.workspace.trips[0].notices[0].title, "다른 창의 변경");
      return true;
    },
  );
  assert.equal(noticeState.items[0].title, "다른 창의 변경");
});

for (const operation of ["create", "update", "remove"])
  for (const failure of ["lost response", "failed reload"]) {
    test(`Notice ${operation} retries ${failure} with the captured version and one idempotency key`, async () => {
      const { repo, noticeState } = noticeRepositoryFixture();
      await repo.signIn("1@example.invalid", "dummy");
      await repo.load();
      let item = noticeDraft();
      if (operation !== "create")
        item = (await repo.execute(planningSave("notices", item))).trips[0]
          .notices[0];
      noticeState.calls = [];
      const command =
        operation === "remove"
          ? {
              type: "item.delete",
              tripId: "91",
              collection: "notices",
              itemId: item.id,
              expectedVersion: item.version,
            }
          : planningSave("notices", { ...item, title: "변경 안내" });
      const perform = repo.noticeApi[operation],
        read = repo.noticeApi.list;
      let failed = false,
        failRead = false;
      repo.noticeApi[operation] = async (...args) => {
        const result = await perform(...args);
        if (!failed) {
          failed = true;
          if (failure === "lost response") throw new Error(failure);
          failRead = true;
        }
        return result;
      };
      repo.noticeApi.list = async () => {
        if (failRead) {
          failRead = false;
          throw new Error(failure);
        }
        return read();
      };
      await assert.rejects(repo.execute(command), new RegExp(failure));
      const result = await repo.execute(command);
      assert.equal(
        result.trips[0].notices.length,
        operation === "remove" ? 0 : 1,
      );
      assert.equal(
        noticeState.calls.length,
        failure === "lost response" ? 2 : 1,
      );
      assert.equal(
        new Set(noticeState.calls.map((call) => call.at(-1))).size,
        1,
      );
      if (operation === "update")
        assert.equal(noticeState.items[0].version, "1");
    });
  }

test("Notice API validates shared fields and sends nested paths, versions and idempotency headers", async () => {
  const { NoticeApi } = require("../src/data/notice-api.ts");
  const calls = [];
  const item = {
    ...noticeDraft({ id: "9007199254740993" }),
    version: "0",
    authorName: "여행장",
    updatedAt: "2026-10-25T00:00:00Z",
  };
  const transport = {
    request: async (...args) => {
      calls.push(args);
      return item;
    },
  };
  const api = new NoticeApi(transport, { all: async () => [item] });
  assert.equal((await api.list("91"))[0].id, item.id);
  const input = { title: item.title, body: item.body, pinned: item.pinned };
  await api.create("91", input, "create-key");
  await api.update(
    "91",
    item.id,
    { ...input, expectedVersion: "0" },
    "update-key",
  );
  await api.remove("91", item.id, "1", "delete-key");
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["POST", "PUT", "DELETE"],
  );
  assert.deepEqual(
    calls.map((call) => call[3]["Idempotency-Key"]),
    ["create-key", "update-key", "delete-key"],
  );
  assert.ok(calls[2][0].endsWith(`/${item.id}?expectedVersion=1`));
  item.version = "9223372036854775808";
  await assert.rejects(api.list("91"), /응답 형식/);
});

test("Expired notice retries refresh the shared list without resending an uncertain creation", async (t) => {
  const { repo, noticeState } = noticeRepositoryFixture();
  const originalTime = Date.now;
  let current = originalTime();
  Date.now = () => current;
  t.after(() => {
    Date.now = originalTime;
  });
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const command = planningSave("notices", noticeDraft());
  const perform = repo.noticeApi.create;
  repo.noticeApi.create = async (...args) => {
    await perform(...args);
    throw new Error("lost response");
  };
  await assert.rejects(repo.execute(command), /lost response/);
  current += 24 * 60 * 60 * 1000 + 1;
  await assert.rejects(repo.execute(command), (error) => {
    assert.equal(error.code, "NOTICE_RETRY_EXPIRED");
    assert.equal(error.workspace.trips[0].notices.length, 1);
    return true;
  });
  assert.equal(noticeState.calls.length, 1);
});

test("Restored planning screens keep device drafts across refresh without overwriting server membership", async () => {
  const { repo, values, trip, account } = restoredRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const command = {
    type: "item.save",
    tripId: "91",
    collection: "messages",
    item: {
      id: "notice-1",
      text: "여권을 챙겨요",
      authorId: "1",
      createdAt: "2026-10-02T00:00:00Z",
    },
  };
  const saved = await repo.execute(command);
  assert.equal(saved.trips[0].messages[0].text, "여권을 챙겨요");
  assert.equal(saved.notifications.length, 0);
  assert.equal((await repo.load()).trips[0].messages.length, 1);
  const [key, raw] = [...values][0];
  assert.ok(key.endsWith(":1"));
  assert.ok(!raw.includes("memory-only"));
  const draft = JSON.parse(raw);
  assert.equal(draft["91"].ownerId, undefined);
  assert.equal(draft["91"].memberIds, undefined);
  draft["91"].ownerId = "attacker";
  draft["91"].memberIds = ["attacker"];
  values.set(key, JSON.stringify(draft));
  assert.equal((await repo.load()).trips[0].ownerId, "1");
  assert.deepEqual((await repo.load()).trips[0].memberIds, ["1", "2"]);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  assert.equal((await repo.load()).trips[0].messages.length, 0);
  await repo.signOut();
  account("1");
  await repo.signIn("1@example.invalid", "dummy");
  assert.equal((await repo.load()).trips[0].messages.length, 1);
  trip.status = "ARCHIVED";
  await assert.rejects(repo.execute(command), /보관|종료/);
});
test("Party create/update/delete use the server, survive another account, and preserve old local drafts", async () => {
  const { repo, values, account } = restoredRepositoryFixture();
  let parties = [];
  const calls = [];
  repo.tripApi.parties = async () => structuredClone(parties);
  repo.tripApi.createParty = async (tripId, input, key) => {
    calls.push(["create", tripId, input, key]);
    const party = { id: "301", ...input };
    parties.push(party);
    return party;
  };
  repo.tripApi.updateParty = async (tripId, id, input) => {
    calls.push(["update", tripId, id, input]);
    parties = [{ id, ...input }];
    return parties[0];
  };
  repo.tripApi.removeParty = async (tripId, id) => {
    calls.push(["delete", tripId, id]);
    parties = [];
  };
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const saveParty = (item) => ({
    type: "item.save",
    tripId: "91",
    collection: "parties",
    item,
  });
  const created = await repo.execute(
    saveParty({ id: "local-new", name: " 카페팀 ", memberIds: ["2", "1"] }),
  );
  assert.deepEqual(created.trips[0].parties, [
    { id: "301", name: "카페팀", memberIds: ["1", "2"] },
  ]);
  assert.equal(values.size, 0);
  assert.deepEqual(calls[0].slice(0, 3), [
    "create",
    "91",
    { name: "카페팀", memberIds: ["1", "2"] },
  ]);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  assert.equal((await repo.load()).trips[0].parties[0].id, "301");
  const updated = await repo.execute(
    saveParty({ id: "301", name: "산책팀", memberIds: ["2"] }),
  );
  assert.deepEqual(updated.trips[0].parties[0].memberIds, ["2"]);
  await repo.execute({
    type: "item.save",
    tripId: "91",
    collection: "messages",
    item: {
      id: "notice",
      text: "물을 챙겨요",
      authorId: "2",
      createdAt: "2026-10-02T00:00:00Z",
    },
  });
  const [key, raw] = [...values][0];
  const old = JSON.parse(raw);
  old["91"].parties = [
    { id: "legacy", name: "예전 기기 파티", memberIds: ["1"] },
  ];
  values.set(key, JSON.stringify(old));
  assert.deepEqual((await repo.load()).trips[0].parties, parties);
  await repo.execute({
    type: "item.save",
    tripId: "91",
    collection: "messages",
    item: {
      id: "message-2",
      text: "물을 챙겼어요",
      authorId: "2",
      createdAt: "2026-10-02T00:00:00Z",
    },
  });
  assert.equal(JSON.parse(values.get(key))["91"].parties[0].id, "legacy");
  const removed = await repo.execute({
    type: "item.delete",
    tripId: "91",
    collection: "parties",
    itemId: "301",
  });
  assert.deepEqual(removed.trips[0].parties, []);
  assert.deepEqual(calls.at(-1), ["delete", "91", "301"]);
});

test("Party retries reuse a creation key after a lost response or a failed reload", async () => {
  const { repo } = restoredRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const keys = [];
  let failReload = false;
  repo.tripApi.createParty = async (tripId, input, key) => {
    keys.push(key);
    if (keys.length === 1) throw new Error("lost response");
    failReload = keys.length === 2;
    return { id: "301", ...input };
  };
  repo.tripApi.parties = async () => {
    if (failReload) {
      failReload = false;
      throw new Error("reload failed");
    }
    return [{ id: "301", name: "카페팀", memberIds: ["1"] }];
  };
  const save = (id) => ({
    type: "item.save",
    tripId: "91",
    collection: "parties",
    item: { id, name: "카페팀", memberIds: ["1"] },
  });
  await assert.rejects(repo.execute(save("draft-1")), /lost response/);
  await assert.rejects(repo.execute(save("draft-2")), /reload failed/);
  assert.equal(
    (await repo.execute(save("draft-3"))).trips[0].parties[0].id,
    "301",
  );
  assert.equal(new Set(keys).size, 1);
  await repo.execute(save("draft-4"));
  assert.notEqual(keys[3], keys[2]);
});

test("Party API uses existing subgroup fields and the correct nested paths", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const { TripApi } = require("../src/data/trip-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(
      JSON.stringify({
        code: "SUCCESS",
        data:
          options.method === "GET"
            ? { items: [], nextCursor: null }
            : { id: "301" },
      }),
    );
  };
  const api = new TripApi(new UserApi("http://test/api"));
  const input = { name: "카페팀", memberIds: ["1", "2"] };
  await api.parties("91");
  await api.createParty("91", input, "retry-key");
  await api.updateParty("91", "301", input);
  await api.removeParty("91", "301");
  assert.ok(calls[0].url.endsWith("/v1/trips/91/parties?limit=100"));
  assert.equal(calls[1].headers["Idempotency-Key"], "retry-key");
  assert.deepEqual(JSON.parse(calls[1].body), input);
  assert.equal(calls[2].method, "PUT");
  assert.ok(calls[2].url.endsWith("/v1/trips/91/parties/301"));
  assert.equal(calls[3].method, "DELETE");
});

const serverPlace = (overrides = {}) => ({
  id: "9007199254740993",
  name: "해운대 카페",
  address: "부산광역시 해운대구 달맞이길 1",
  category: "카페",
  note: "창가 좌석 예약",
  coordinates: { latitude: 35.158, longitude: 129.161 },
  ...overrides,
});
const serverAgenda = (overrides = {}) => ({
  id: "9007199254740995",
  title: "카페에서 쉬기",
  date: "2026-10-10",
  startTime: "10:00",
  endTime: "11:00",
  placeId: "9007199254740993",
  partyId: null,
  note: "예약 확인",
  placeName: "해운대 카페",
  address: "부산광역시 해운대구 달맞이길 1",
  ...overrides,
});
const planningSave = (collection, item) => ({
  type: "item.save",
  tripId: "91",
  collection,
  item,
});
const planningDelete = (collection, itemId) => ({
  type: "item.delete",
  tripId: "91",
  collection,
  itemId,
});

function serverPlanningFixture() {
  const f = restoredRepositoryFixture();
  const state = { places: [], agenda: [] };
  const planningCalls = [];
  f.repo.tripApi.savedPlaces = async () => structuredClone(state.places);
  f.repo.tripApi.itineraryItems = async () => structuredClone(state.agenda);
  f.repo.tripApi.parties = async () => [
    { id: "301", name: "카페팀", memberIds: ["1", "2"] },
  ];
  for (const [collection, label, expectedId] of [
    ["places", "SavedPlace", "9007199254740993"],
    ["agenda", "ItineraryItem", "9007199254740995"],
  ]) {
    const serialize = (id, input) => {
      const result = { id, ...structuredClone(input) };
      if (collection === "agenda") {
        const place = state.places.find((p) => p.id === input.placeId);
        result.placeName = place?.name ?? null;
        result.address = place?.address ?? null;
      }
      return result;
    };
    f.repo.tripApi[`create${label}`] = async (tripId, input, key) => {
      planningCalls.push([
        "create",
        collection,
        tripId,
        structuredClone(input),
        key,
      ]);
      const item = serialize(expectedId, input);
      state[collection].push(item);
      return structuredClone(item);
    };
    f.repo.tripApi[`update${label}`] = async (tripId, id, input) => {
      planningCalls.push([
        "update",
        collection,
        tripId,
        id,
        structuredClone(input),
      ]);
      const index = state[collection].findIndex((item) => item.id === id);
      assert.notEqual(index, -1, "update must refer to a server item");
      state[collection][index] = serialize(id, input);
      return structuredClone(state[collection][index]);
    };
    f.repo.tripApi[`remove${label}`] = async (tripId, id) => {
      planningCalls.push(["delete", collection, tripId, id]);
      state[collection] = state[collection].filter((item) => item.id !== id);
    };
  }
  return { ...f, state, planningCalls };
}

test("Server places and itinerary CRUD share IDs, notes, coordinates and subgroup references across accounts", async () => {
  const { repo, values, account, planningCalls } = serverPlanningFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  let workspace = await repo.execute(
    planningSave(
      "places",
      serverPlace({
        id: "draft-place",
        googlePlaceId: "google-search-only",
      }),
    ),
  );
  const place = workspace.trips[0].places[0];
  assert.deepEqual(place, serverPlace());
  assert.equal(place.googlePlaceId, undefined);
  assert.equal(planningCalls[0][3].id, undefined);
  assert.equal(planningCalls[0][3].googlePlaceId, undefined);
  workspace = await repo.execute(
    planningSave(
      "agenda",
      serverAgenda({
        id: "draft-agenda",
        partyId: "301",
      }),
    ),
  );
  assert.equal(workspace.trips[0].agenda[0].id, "9007199254740995");
  assert.equal(workspace.trips[0].agenda[0].placeId, place.id);
  assert.equal(workspace.trips[0].agenda[0].partyId, "301");
  assert.equal(workspace.trips[0].agenda[0].placeName, place.name);
  assert.equal(planningCalls[1][3].id, undefined);
  assert.equal(planningCalls[1][3].placeName, undefined);
  assert.equal(planningCalls[1][3].address, undefined);
  const route = buildDayRoute(workspace.trips[0], "2026-10-10", "301");
  assert.equal(route.located.length, 1);
  assert.deepEqual(route.located[0].place.coordinates, place.coordinates);
  assert.equal(values.size, 0);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  workspace = await repo.load();
  assert.equal(workspace.trips[0].agenda[0].note, "예약 확인");
  assert.deepEqual(workspace.trips[0].places[0].coordinates, place.coordinates);
  workspace = await repo.execute(
    planningSave("places", {
      ...workspace.trips[0].places[0],
      name: "바다 카페",
      note: "다른 멤버가 수정한 메모",
      coordinates: null,
    }),
  );
  assert.equal(workspace.trips[0].places[0].name, "바다 카페");
  assert.equal(workspace.trips[0].places[0].coordinates, null);
  workspace = await repo.execute(
    planningSave("agenda", {
      ...workspace.trips[0].agenda[0],
      title: "카페 예약 변경",
      date: "2026-10-11",
      startTime: "14:00",
      endTime: "14:00",
      partyId: null,
      note: "시간 변경 공유",
    }),
  );
  assert.equal(workspace.trips[0].agenda[0].title, "카페 예약 변경");
  assert.equal(workspace.trips[0].agenda[0].placeName, "바다 카페");
  assert.equal(workspace.trips[0].agenda[0].partyId, null);
  assert.deepEqual(planningCalls[2].slice(0, 4), [
    "update",
    "places",
    "91",
    "9007199254740993",
  ]);
  assert.deepEqual(planningCalls[3].slice(0, 4), [
    "update",
    "agenda",
    "91",
    "9007199254740995",
  ]);
  await assert.rejects(
    repo.execute(planningDelete("places", place.id)),
    /연결/,
  );
  assert.equal(planningCalls.length, 4);
  await repo.execute(planningDelete("agenda", "9007199254740995"));
  workspace = await repo.execute(planningDelete("places", place.id));
  assert.deepEqual(workspace.trips[0].places, []);
  assert.deepEqual(workspace.trips[0].agenda, []);
  assert.equal(values.size, 0);
  assert.deepEqual(planningCalls.slice(-2), [
    ["delete", "agenda", "91", "9007199254740995"],
    ["delete", "places", "91", "9007199254740993"],
  ]);
});

test("Server planning reads preserve legacy device originals after unrelated local writes without automatic uploads", async () => {
  const { repo, values, state, planningCalls } = serverPlanningFixture();
  const key = "trip-device-notes-v1:http%3A%2F%2Flocalhost%3A8080%2Fapi:1";
  const old = {
    91: {
      places: [
        serverPlace({
          id: "old-place",
          name: "기기 전용 장소",
          googlePlaceId: "old-google",
        }),
      ],
      agenda: [
        serverAgenda({
          id: "old-agenda",
          placeId: "old-place",
          note: "기기 원본 메모",
        }),
      ],
      parties: [{ id: "old-party", name: "예전 소그룹", memberIds: ["1"] }],
      checklist: [],
    },
  };
  const original = JSON.stringify(old);
  values.set(key, original);
  values.set("workspace-v1", original);
  state.places = [serverPlace()];
  state.agenda = [serverAgenda()];
  await repo.signIn("1@example.invalid", "dummy");
  let workspace = await repo.load();
  assert.deepEqual(workspace.trips[0].places, state.places);
  assert.deepEqual(workspace.trips[0].agenda, state.agenda);
  assert.equal(values.get(key), original);
  workspace = await repo.execute(
    planningSave("messages", {
      id: "new-notice",
      text: "우산을 챙겨요",
      authorId: "1",
      createdAt: "2026-10-02T00:00:00Z",
    }),
  );
  const persisted = JSON.parse(values.get(key))["91"];
  assert.deepEqual(persisted.places, old["91"].places);
  assert.deepEqual(persisted.agenda, old["91"].agenda);
  assert.deepEqual(persisted.parties, old["91"].parties);
  assert.equal(persisted.messages[0].text, "우산을 챙겨요");
  assert.equal(values.get("workspace-v1"), original);
  assert.deepEqual(planningCalls, []);
  assert.deepEqual(workspace.trips[0].places, state.places);
  state.places = [];
  state.agenda = [];
  workspace = await repo.load();
  assert.deepEqual(workspace.trips[0].places, []);
  assert.deepEqual(workspace.trips[0].agenda, []);
});

test("Loaded itinerary snapshot text survives without a saved-place link and never infers a misleading map location", async () => {
  const { repo, state } = serverPlanningFixture();
  state.places = [serverPlace()];
  state.agenda = [
    serverAgenda({
      placeId: null,
      placeName: "예전 장소 이름",
      address: "예전 주소",
      startTime: "",
      endTime: "",
    }),
  ];
  await repo.signIn("1@example.invalid", "dummy");
  const workspace = await repo.load();
  const agenda = workspace.trips[0].agenda[0];
  assert.equal(agenda.placeId, null);
  assert.equal(agenda.placeName, "예전 장소 이름");
  assert.equal(agenda.address, "예전 주소");
  assert.equal(agenda.startTime, "");
  const route = buildDayRoute(workspace.trips[0], "2026-10-10", null);
  assert.equal(route.located.length, 0);
  assert.equal(route.missing.length, 1);
});

for (const [collection, method, saved] of [
  ["places", "createSavedPlace", serverPlace()],
  [
    "agenda",
    "createItineraryItem",
    serverAgenda({ placeId: null, placeName: null, address: null }),
  ],
]) {
  for (const failure of [
    "lost response",
    "failed reload",
    "lost response then failed reload",
  ]) {
    test(`${collection} creates retain one key through ${failure} and a changed editor draft ID`, async () => {
      const { repo, state } = serverPlanningFixture();
      await repo.signIn("1@example.invalid", "dummy");
      await repo.load();
      const keys = [],
        bodies = [],
        results = new Map();
      const failResponse = failure.includes("lost response");
      const failReload = failure.includes("failed reload");
      let reloadFailed = false;
      repo.tripApi[method] = async (tripId, input, key) => {
        keys.push(key);
        bodies.push(JSON.stringify(input));
        if (!results.has(key)) {
          results.set(key, { ...saved, ...input });
          state[collection].push(results.get(key));
        }
        if (failResponse && keys.length === 1) throw new Error("lost response");
        return structuredClone(results.get(key));
      };
      const listMethod =
        collection === "places" ? "savedPlaces" : "itineraryItems";
      repo.tripApi[listMethod] = async () => {
        if (failReload && keys.length && !reloadFailed) {
          reloadFailed = true;
          throw new Error("reload failed");
        }
        return structuredClone(state[collection]);
      };
      let attempt = 0;
      if (failResponse) {
        await assert.rejects(
          repo.execute(
            planningSave(collection, { ...saved, id: `draft-${++attempt}` }),
          ),
          /lost response/,
        );
      }
      if (failReload) {
        await assert.rejects(
          repo.execute(
            planningSave(collection, { ...saved, id: `draft-${++attempt}` }),
          ),
          /reload failed/,
        );
      }
      const workspace = await repo.execute(
        planningSave(collection, { ...saved, id: `draft-${++attempt}` }),
      );
      assert.equal(workspace.trips[0][collection].length, 1);
      assert.equal(workspace.trips[0][collection][0].id, saved.id);
      assert.equal(new Set(keys).size, 1);
      assert.equal(new Set(bodies).size, 1);
      assert.equal(state[collection].length, 1);
      await repo.execute(
        planningSave(collection, { ...saved, id: "a-new-intentional-draft" }),
      );
      assert.notEqual(keys.at(-1), keys[0]);
    });
  }
}

function uncertainPlanningCreate(collection, failure) {
  const f = serverPlanningFixture();
  const method =
    collection === "places" ? "createSavedPlace" : "createItineraryItem";
  const listMethod = collection === "places" ? "savedPlaces" : "itineraryItems";
  const saved =
    collection === "places" ? serverPlace() : serverAgenda({ partyId: "301" });
  if (collection === "agenda") f.state.places = [serverPlace()];
  const keys = [],
    results = new Map();
  let failNextReload = false;
  f.repo.tripApi[method] = async (tripId, input, key) => {
    keys.push(key);
    if (!results.has(key)) {
      const item = { ...saved, ...structuredClone(input) };
      results.set(key, item);
      f.state[collection].push(item);
      if (failure === "lost response") throw new Error("lost response");
      failNextReload = true;
    }
    return structuredClone(results.get(key));
  };
  f.repo.tripApi[listMethod] = async () => {
    if (failNextReload) {
      failNextReload = false;
      throw new Error("reload failed");
    }
    return structuredClone(f.state[collection]);
  };
  return { ...f, saved, keys };
}

for (const [collection, changedState, expectedError] of [
  ["places", "archived trip", /보관|종료/],
  ["agenda", "archived trip", /보관|종료/],
  ["agenda", "removed place", /장소/],
  ["agenda", "removed subgroup", /파티/],
]) {
  for (const failure of ["lost response", "failed reload"]) {
    test(`${collection} replays a known ${failure} after reloading an ${changedState} without making a duplicate`, async () => {
      const { repo, trip, state, keys, saved } = uncertainPlanningCreate(
        collection,
        failure,
      );
      await repo.signIn("1@example.invalid", "dummy");
      await repo.load();
      await assert.rejects(
        repo.execute(planningSave(collection, { ...saved, id: "first-draft" })),
        failure === "lost response" ? /lost response/ : /reload failed/,
      );
      assert.equal(keys.length, 1);
      assert.equal(state[collection].length, 1);
      if (changedState === "archived trip") trip.status = "ARCHIVED";
      else if (changedState === "removed place") {
        state.places = [];
        state.agenda[0].placeId = null;
      } else {
        repo.tripApi.parties = async () => [];
        state.agenda[0].partyId = null;
      }
      const reloaded = await repo.load();
      if (changedState === "archived trip")
        assert.equal(reloaded.trips[0].archived, true);
      else if (changedState === "removed place")
        assert.deepEqual(reloaded.trips[0].places, []);
      else assert.deepEqual(reloaded.trips[0].parties, []);
      await assert.rejects(
        repo.execute(
          planningSave(collection, {
            ...saved,
            id: "changed-input-draft",
            note: "새 입력",
          }),
        ),
        expectedError,
      );
      assert.equal(
        keys.length,
        1,
        "changed input must pass regular validation",
      );
      if (changedState === "archived trip") {
        await assert.rejects(
          repo.execute(planningSave(collection, saved)),
          expectedError,
        );
        await assert.rejects(
          repo.execute(planningDelete(collection, saved.id)),
          expectedError,
        );
        assert.equal(keys.length, 1);
      }
      const retry =
        collection === "places"
          ? {
              ...saved,
              id: "retry-draft",
              name: ` ${saved.name} `,
              address: ` ${saved.address} `,
              category: ` ${saved.category} `,
            }
          : { ...saved, id: "retry-draft", title: ` ${saved.title} ` };
      const replayed = await repo.execute(planningSave(collection, retry));
      assert.equal(keys.length, 2);
      assert.equal(keys[1], keys[0]);
      assert.equal(state[collection].length, 1);
      assert.equal(replayed.trips[0][collection][0].id, saved.id);
      await assert.rejects(
        repo.execute(
          planningSave(collection, {
            ...saved,
            id: "new-draft-after-completed-retry",
          }),
        ),
        expectedError,
      );
      assert.equal(
        keys.length,
        2,
        "a completed retry cannot bypass new-write validation",
      );
    });
  }
}

for (const collection of ["places", "agenda"]) {
  test(`${collection} cannot reuse an uncertain creation after session reset bypassing archive validation`, async () => {
    const { repo, trip, state, keys, saved } = uncertainPlanningCreate(
      collection,
      "lost response",
    );
    await repo.signIn("1@example.invalid", "dummy");
    await repo.load();
    await assert.rejects(
      repo.execute(
        planningSave(collection, { ...saved, id: "draft-before-reset" }),
      ),
      /lost response/,
    );
    trip.status = "ARCHIVED";
    await repo.load();
    await repo.signOut();
    await repo.signIn("1@example.invalid", "dummy");
    await repo.load();
    await assert.rejects(
      repo.execute(
        planningSave(collection, { ...saved, id: "draft-after-reset" }),
      ),
      /보관|종료/,
    );
    assert.equal(keys.length, 1);
    assert.equal(state[collection].length, 1);
  });
}

test("Place and itinerary pending creation keys stay independent and change when their input changes", async () => {
  const { repo } = serverPlanningFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const keys = { places: [], agenda: [] };
  for (const [collection, method] of [
    ["places", "createSavedPlace"],
    ["agenda", "createItineraryItem"],
  ]) {
    repo.tripApi[method] = async (tripId, input, key) => {
      keys[collection].push(key);
      throw new Error("offline");
    };
  }
  const place = serverPlace({ id: "place-1" });
  const agenda = serverAgenda({ id: "agenda-1", placeId: null });
  await assert.rejects(repo.execute(planningSave("places", place)), /offline/);
  await assert.rejects(repo.execute(planningSave("agenda", agenda)), /offline/);
  await assert.rejects(
    repo.execute(planningSave("places", { ...place, id: "place-2" })),
    /offline/,
  );
  await assert.rejects(
    repo.execute(planningSave("agenda", { ...agenda, id: "agenda-2" })),
    /offline/,
  );
  assert.equal(keys.places[0], keys.places[1]);
  assert.equal(keys.agenda[0], keys.agenda[1]);
  assert.notEqual(keys.places[0], keys.agenda[0]);
  await assert.rejects(
    repo.execute(planningSave("places", { ...place, note: "changed" })),
    /offline/,
  );
  await assert.rejects(
    repo.execute(planningSave("agenda", { ...agenda, note: "changed" })),
    /offline/,
  );
  assert.notEqual(keys.places[2], keys.places[0]);
  assert.notEqual(keys.agenda[2], keys.agenda[0]);
});

test("New sessions discard pending place and itinerary creation keys", async () => {
  const { repo, account } = serverPlanningFixture();
  const keys = { places: [], agenda: [] };
  for (const [collection, method] of [
    ["places", "createSavedPlace"],
    ["agenda", "createItineraryItem"],
  ]) {
    repo.tripApi[method] = async (tripId, input, key) => {
      keys[collection].push(key);
      throw new Error("offline");
    };
  }
  for (const userId of ["1", "2"]) {
    account(userId);
    await repo.signIn(`${userId}@example.invalid`, "dummy");
    await repo.load();
    await assert.rejects(
      repo.execute(planningSave("places", serverPlace({ id: "draft-place" }))),
      /offline/,
    );
    await assert.rejects(
      repo.execute(
        planningSave(
          "agenda",
          serverAgenda({ id: "draft-agenda", placeId: null }),
        ),
      ),
      /offline/,
    );
    await repo.signOut();
  }
  assert.notEqual(keys.places[0], keys.places[1]);
  assert.notEqual(keys.agenda[0], keys.agenda[1]);
});

test("A place creation resolving after an account switch cannot load or expose the previous session's workspace", async () => {
  const { repo, account, state } = serverPlanningFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  let release, entered;
  const began = new Promise((resolve) => {
    entered = resolve;
  });
  repo.tripApi.createSavedPlace = () => {
    entered();
    return new Promise((resolve) => {
      release = () => resolve(serverPlace());
    });
  };
  const pending = repo.execute(
    planningSave("places", serverPlace({ id: "draft" })),
  );
  await began;
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  state.places = [serverPlace({ name: "현재 계정의 서버 장소" })];
  const switched = await repo.load();
  const rejected = assert.rejects(pending, /로그인|SESSION_CHANGED/);
  release();
  await rejected;
  assert.equal(
    switched.users.find((user) => user.email === "2@example.invalid").id,
    "2",
  );
  assert.equal(
    (await repo.load()).trips[0].places[0].name,
    "현재 계정의 서버 장소",
  );
});

test("A planning list response completing after an account switch is rejected before replacing the workspace", async () => {
  const { repo, account } = serverPlanningFixture();
  await repo.signIn("1@example.invalid", "dummy");
  let release,
    entered,
    request = 0;
  const began = new Promise((resolve) => {
    entered = resolve;
  });
  repo.tripApi.itineraryItems = () => {
    if (++request !== 1) return Promise.resolve([]);
    entered();
    return new Promise((resolve) => {
      release = () => resolve([serverAgenda({ placeId: null })]);
    });
  };
  const loading = repo.load();
  await began;
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  const newWorkspace = await repo.load();
  const rejected = assert.rejects(loading, /로그인|SESSION_CHANGED/);
  release();
  await rejected;
  assert.deepEqual(newWorkspace.trips[0].agenda, []);
  assert.deepEqual((await repo.load()).trips[0].agenda, []);
});

test("Planning commands reject archived trips and invalid dates, clocks, references and DB field lengths before sending writes", async () => {
  const { repo, trip, state, planningCalls } = serverPlanningFixture();
  state.places = [serverPlace()];
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  for (const item of [
    serverPlace({ id: "draft", name: "x".repeat(101) }),
    serverPlace({ id: "draft", address: "x".repeat(256) }),
    serverPlace({ id: "draft", category: "x".repeat(51) }),
    serverPlace({ id: "draft", note: "x".repeat(3001) }),
    serverPlace({ id: "draft", coordinates: { latitude: 91, longitude: 129 } }),
  ])
    await assert.rejects(repo.execute(planningSave("places", item)));
  for (const item of [
    serverAgenda({ id: "draft", title: "x".repeat(101) }),
    serverAgenda({ id: "draft", note: "x".repeat(3001) }),
    serverAgenda({ id: "draft", date: "2026-10-13" }),
    serverAgenda({ id: "draft", startTime: "9:00" }),
    serverAgenda({ id: "draft", endTime: "24:00" }),
    serverAgenda({ id: "draft", startTime: "10:00", endTime: "09:00" }),
    serverAgenda({ id: "draft", placeId: "foreign-place" }),
    serverAgenda({ id: "draft", partyId: "foreign-party" }),
  ])
    await assert.rejects(repo.execute(planningSave("agenda", item)));
  assert.equal(planningCalls.length, 0);
  trip.status = "ARCHIVED";
  await repo.load();
  for (const command of [
    planningSave("places", serverPlace({ id: "draft" })),
    planningSave("agenda", serverAgenda({ id: "draft" })),
    planningDelete("places", "9007199254740993"),
  ])
    await assert.rejects(repo.execute(command), /보관|종료/);
  assert.equal(planningCalls.length, 0);
});

test("Planning APIs paginate both nested collections and preserve bigint IDs and encoded cursors", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const { TripApi } = require("../src/data/trip-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(
      JSON.stringify({
        code: "SUCCESS",
        data: url.includes("cursor=")
          ? { items: [{ id: "9007199254740995" }], nextCursor: null }
          : { items: [{ id: "9007199254740993" }], nextCursor: "opaque+/=" },
      }),
    );
  };
  const api = new TripApi(new UserApi("http://test/api/"));
  for (const [method, path] of [
    ["savedPlaces", "saved-places"],
    ["itineraryItems", "itinerary-items"],
  ]) {
    const start = calls.length;
    assert.deepEqual(await api[method]("9007199254740997"), [
      { id: "9007199254740993" },
      { id: "9007199254740995" },
    ]);
    assert.equal(
      calls[start].url,
      `http://test/api/v1/trips/9007199254740997/${path}?limit=100`,
    );
    assert.equal(
      calls[start + 1].url,
      `http://test/api/v1/trips/9007199254740997/${path}?limit=100&cursor=opaque%2B%2F%3D`,
    );
    assert.equal(calls[start].method, "GET");
  }
});

test("Planning APIs use nested item routes, PUT bodies, idempotency headers and DELETE", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const { TripApi } = require("../src/data/trip-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(
      JSON.stringify({ code: "SUCCESS", data: { id: "9007199254740993" } }),
    );
  };
  const user = new UserApi("http://test/api");
  user.token = "access";
  const api = new TripApi(user);
  const placeInput = {
    name: "카페",
    address: "부산",
    category: "카페",
    note: "메모",
    coordinates: { latitude: 35, longitude: 129 },
  };
  const agendaInput = {
    title: "산책",
    date: "2026-10-10",
    startTime: "10:00",
    endTime: "10:30",
    placeId: null,
    partyId: null,
    note: "메모",
  };
  for (const [single, label, path, input] of [
    ["savedPlace", "SavedPlace", "saved-places", placeInput],
    ["itineraryItem", "ItineraryItem", "itinerary-items", agendaInput],
  ]) {
    const start = calls.length;
    await api[single]("91", "9007199254740993");
    await api[`create${label}`]("91", input, "stable-key");
    await api[`update${label}`]("91", "9007199254740993", input);
    await api[`remove${label}`]("91", "9007199254740993");
    assert.deepEqual(
      calls.slice(start).map((call) => call.method),
      ["GET", "POST", "PUT", "DELETE"],
    );
    assert.equal(
      calls[start].url,
      `http://test/api/v1/trips/91/${path}/9007199254740993`,
    );
    assert.equal(calls[start + 1].url, `http://test/api/v1/trips/91/${path}`);
    assert.equal(calls[start + 2].url, calls[start].url);
    assert.equal(calls[start + 3].url, calls[start].url);
    assert.equal(calls[start + 1].headers["Idempotency-Key"], "stable-key");
    assert.equal(calls[start + 1].headers.Authorization, "Bearer access");
    assert.deepEqual(JSON.parse(calls[start + 1].body), input);
    assert.deepEqual(JSON.parse(calls[start + 2].body), input);
    assert.equal(calls[start + 3].body, undefined);
  }
});

test("Planning creation keeps its key and input through access-token refresh", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const { TripApi } = require("../src/data/trip-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  for (const [method, input] of [
    [
      "createSavedPlace",
      {
        name: "카페",
        address: "부산",
        category: "카페",
        note: "",
        coordinates: null,
      },
    ],
    [
      "createItineraryItem",
      {
        title: "산책",
        date: "2026-10-10",
        startTime: "10:00",
        endTime: "11:00",
        placeId: null,
        partyId: null,
        note: "",
      },
    ],
  ]) {
    const user = new UserApi("http://test/api", {
      kind: "NATIVE",
      read: async () => "refresh",
      write: async () => {},
      clear: async () => {},
    });
    user.token = "old";
    const calls = [];
    global.fetch = async (url, options) => {
      if (url.endsWith("/tokens/refresh"))
        return new Response(
          JSON.stringify({
            code: "SUCCESS",
            data: { accessToken: "new", refreshToken: "rotated" },
          }),
        );
      calls.push({ url, ...options });
      if (options.headers.Authorization === "Bearer old")
        return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
          status: 401,
        });
      return new Response(
        JSON.stringify({ code: "SUCCESS", data: { id: "9007199254740993" } }),
      );
    };
    const result = await new TripApi(user)[method](
      "91",
      input,
      "unchanged-key",
    );
    assert.equal(result.id, "9007199254740993");
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.map((call) => call.headers["Idempotency-Key"]),
      ["unchanged-key", "unchanged-key"],
    );
    assert.deepEqual(
      calls.map((call) => JSON.parse(call.body)),
      [input, input],
    );
  }
});

test("Original trip commands use APIs and preserve the editor's version", async () => {
  const { repo, calls, values } = restoredRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  await repo.execute({ type: "trip.invite", tripId: "91", userId: "2" });
  await repo.execute({ type: "friend.add", userId: "2" });
  await repo.execute({
    type: "trip.update",
    tripId: "91",
    version: 1,
    input: {
      title: "수정",
      destination: "부산",
      startDate: "2026-10-10",
      endDate: "2026-10-12",
      budget: 10,
      archived: false,
    },
  });
  assert.deepEqual(calls.slice(0, 2), [
    ["invite", "91", "2"],
    ["friend", "2"],
  ]);
  assert.equal(calls[2][2].version, 1);
  assert.equal(calls[2][2].status, "ACTIVE");
  assert.equal(values.size, 0);
});
test("Original create screen retries a lost response with the same creation key", async () => {
  const { repo } = restoredRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const keys = [];
  repo.tripApi.create = async (input, key) => {
    keys.push(key);
    assert.deepEqual(input.inviteeIds, ["2"]);
    assert.equal(input.memberIds, undefined);
    if (keys.length === 1) throw new Error("connection lost");
    return { trip: { id: "91" } };
  };
  const command = {
    type: "trip.create",
    input: {
      title: "여행",
      destination: "부산",
      startDate: "2026-10-10",
      endDate: "2026-10-12",
      budget: 0,
      memberIds: ["2"],
    },
  };
  await assert.rejects(repo.execute(command), /connection lost/);
  const next = await repo.execute(command);
  assert.equal(next.trips[0].id, "91");
  assert.equal(keys[0], keys[1]);
});

test("Consent list matches nested server contract and failed reauthentication preserves the session", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const api = new UserApi("http://localhost:8080/api");
  api.token = "existing";
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        code: "SUCCESS",
        data: {
          consents: [
            {
              id: "2",
              consentType: "PRIVACY_POLICY",
              version: "1.0",
              agreedAt: "2026-09-16T00:00:00Z",
            },
          ],
        },
      }),
    );
  assert.equal((await api.consents()).length, 1);
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return new Response(
      JSON.stringify({
        code: "INVALID_CREDENTIALS",
        message: "잘못된 비밀번호",
      }),
      { status: 401 },
    );
  };
  await assert.rejects(api.login("test@example.com", "wrong"));
  assert.equal(api.token, "existing");
  let expired = false;
  api.onExpired = () => {
    expired = true;
  };
  global.fetch = async () =>
    new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "만료" }), {
      status: 401,
    });
  await assert.rejects(api.me());
  assert.equal(api.token, null);
  assert.equal(expired, true);
});

test("Concurrent expired requests rotate once and retry with the new access token", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let stored = "refresh-old",
    rotations = 0,
    attempts = 0;
  const store = {
    kind: "NATIVE",
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
    clear: async () => {
      stored = null;
    },
  };
  const api = new UserApi("http://test/api", store);
  api.token = "expired";
  global.fetch = async (url, options) => {
    if (url.endsWith("/tokens/refresh")) {
      rotations++;
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(JSON.parse(options.body).refreshToken, "refresh-old");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify({
          code: "SUCCESS",
          data: { accessToken: "new-access", refreshToken: "refresh-new" },
        }),
      );
    }
    attempts++;
    return options.headers.Authorization === "Bearer expired"
      ? new Response(
          JSON.stringify({ code: "UNAUTHORIZED", message: "expired" }),
          { status: 401 },
        )
      : new Response(JSON.stringify({ code: "SUCCESS", data: { id: "1" } }));
  };
  await Promise.all([api.me(), api.settings(), api.me()]);
  assert.equal(rotations, 1);
  assert.equal(attempts, 6);
  assert.equal(stored, "refresh-new");
});

test("Restart restores session through refresh and logout removes durable credentials", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let stored = "persisted";
  const store = {
    kind: "NATIVE",
    read: async () => stored,
    write: async (value) => {
      stored = value;
    },
    clear: async () => {
      stored = null;
    },
  };
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    if (url.endsWith("/logout")) {
      assert.equal(JSON.parse(options.body).refreshToken, "rotated");
      return new Response(JSON.stringify({ code: "SUCCESS", data: null }));
    }
    return new Response(
      JSON.stringify({
        code: "SUCCESS",
        data: { accessToken: "access", refreshToken: "rotated" },
      }),
    );
  };
  const api = new UserApi("http://test/api", store);
  assert.equal(await api.restore(), true);
  assert.equal(api.token, "access");
  await api.logout();
  assert.equal(stored, null);
  assert.equal(api.token, null);
  assert.equal(await new UserApi("http://test/api", store).restore(), false);
});

test("Ambiguous refresh failures are not retried and clear the consumed credential", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let stored = "old",
    calls = 0,
    expired = 0;
  const api = new UserApi("http://test/api", {
    kind: "NATIVE",
    read: async () => stored,
    write: async (v) => {
      stored = v;
    },
    clear: async () => {
      stored = null;
    },
  });
  api.token = "access";
  api.onExpired = () => {
    expired++;
  };
  global.fetch = async () => {
    calls++;
    throw new TypeError("network lost");
  };
  await assert.rejects(api.refresh(), /network lost/);
  assert.equal(calls, 1);
  assert.equal(stored, null);
  assert.equal(api.token, null);
  assert.equal(expired, 1);
});

test("Logout waits for in-flight rotation and cannot resurrect a session", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let stored = "old",
    release,
    started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const api = new UserApi("http://test/api", {
    kind: "NATIVE",
    read: async () => stored,
    write: async (v) => {
      stored = v;
    },
    clear: async () => {
      stored = null;
    },
  });
  global.fetch = async (url, options) => {
    if (url.endsWith("/tokens/refresh")) {
      started();
      await gate;
      return new Response(
        JSON.stringify({
          code: "SUCCESS",
          data: { accessToken: "new", refreshToken: "rotated" },
        }),
      );
    }
    assert.equal(JSON.parse(options.body).refreshToken, "rotated");
    return new Response(JSON.stringify({ code: "SUCCESS", data: null }));
  };
  const rotating = api.refresh();
  await began;
  const logout = api.logout();
  release();
  await Promise.all([rotating, logout]);
  assert.equal(api.token, null);
  assert.equal(stored, null);
});

test("Web refresh sends only cookies and uses the exclusive rotation gate", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let locks = 0,
    cleared = false;
  const api = new UserApi("http://test/api", {
    kind: "WEB",
    read: async () => null,
    write: async () => {},
    clear: async () => {
      cleared = true;
    },
    exclusive: async (action) => {
      locks++;
      return action();
    },
  });
  global.fetch = async (url, options) => {
    assert.equal(options.credentials, "include");
    assert.deepEqual(JSON.parse(options.body), { clientType: "WEB" });
    return new Response(
      JSON.stringify({ code: "SUCCESS", data: { accessToken: "web-access" } }),
    );
  };
  assert.equal(await api.restore(), true);
  assert.equal(locks, 1);
  assert.equal(cleared, false);
});

test("Late retry responses cannot overwrite or expire a newly logged-in account", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  for (const status of [200, 401]) {
    const api = new UserApi("http://test/api", {
      kind: "WEB",
      read: async () => null,
      write: async () => {},
      clear: async () => {},
    });
    let release, started;
    const began = new Promise((resolve) => {
      started = resolve;
    });
    let requests = 0,
      logins = 0;
    const ok = (data) =>
      new Response(JSON.stringify({ code: "SUCCESS", data }));
    global.fetch = async (url) => {
      if (url.endsWith("/login")) {
        logins++;
        return ok({ accessToken: `account-${logins}`, userId: String(logins) });
      }
      if (url.endsWith("/tokens/refresh"))
        return ok({ accessToken: "rotated", userId: "1" });
      if (++requests === 1)
        return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
          status: 401,
        });
      started();
      return new Promise((resolve) => {
        release = () =>
          resolve(
            status === 200
              ? ok({ id: "1" })
              : new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
                  status,
                }),
          );
      });
    };
    await api.login("a@example.invalid", "test");
    const pending = api.me();
    await began;
    await api.login("b@example.invalid", "test");
    const rejected = assert.rejects(pending);
    release();
    await rejected;
    assert.equal(api.token, "account-2");
  }
});

test("A different account in another tab never receives the original pending write", async (t) => {
  const { UserApi } = require("../src/data/user-api.ts");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  const api = new UserApi("http://test/api", {
    kind: "WEB",
    read: async () => null,
    write: async () => {},
    clear: async () => {},
  });
  let writes = 0;
  global.fetch = async (url) => {
    if (url.endsWith("/login"))
      return new Response(
        JSON.stringify({
          code: "SUCCESS",
          data: { accessToken: "account-a", userId: "1" },
        }),
      );
    if (url.endsWith("/tokens/refresh"))
      return new Response(
        JSON.stringify({
          code: "SUCCESS",
          data: { accessToken: "account-b", userId: "2" },
        }),
      );
    writes++;
    return new Response(
      JSON.stringify({ code: "UNAUTHORIZED", message: "expired" }),
      { status: 401 },
    );
  };
  await api.login("a@example.com", "password");
  await assert.rejects(
    api.updateProfile({ name: "Changed" }),
    (error) => error.code === "SESSION_CHANGED",
  );
  assert.equal(writes, 1);
  assert.equal(api.token, null);
});

const sharedExpense = (overrides = {}) => ({
  id: "9007199254741001",
  title: "저녁 식사",
  amount: 30000,
  date: "2026-09-01",
  payerId: "1",
  shares: { 1: 10000, 2: 20000 },
  partyId: "301",
  note: "예약 비용 포함",
  ...overrides,
});
function expenseRepositoryFixture() {
  const fixture = restoredRepositoryFixture();
  const state = { expenses: [], revision: "0", confirmations: new Map() };
  const financialCalls = [],
    responses = new Map();
  fixture.repo.tripApi.parties = async () => [
    { id: "301", name: "식사팀", memberIds: ["1", "2"] },
  ];
  fixture.repo.tripApi.expenses = async () => ({
    items: structuredClone(state.expenses),
    settlementRevision: state.revision,
  });
  fixture.repo.tripApi.settlement = async () => {
    const settlement = calculateSettlement({
      memberIds: ["1", "2"],
      expenses: state.expenses,
    });
    return {
      ...settlement,
      settlementRevision: state.revision,
      transfers: settlement.transfers.map((transfer) => {
        const key = `${state.revision}:${transfer.key}`;
        return {
          ...transfer,
          key,
          completed: false,
          confirmationVersion: "0",
          ...state.confirmations.get(key),
        };
      }),
    };
  };
  const write = (operation, args, key, mutate) => {
    financialCalls.push([operation, ...structuredClone(args), key]);
    if (!responses.has(key)) responses.set(key, structuredClone(mutate()));
    return structuredClone(responses.get(key));
  };
  const changed = () => {
    state.revision = String(BigInt(state.revision) + 1n);
  };
  fixture.repo.tripApi.createExpense = async (tripId, input, key) =>
    write("create", [tripId, input], key, () => {
      const expense = sharedExpense({
        ...input,
        id: String(9007199254741001n + BigInt(state.expenses.length)),
      });
      state.expenses.push(expense);
      changed();
      return { expense, settlementRevision: state.revision };
    });
  fixture.repo.tripApi.updateExpense = async (tripId, id, input, key) =>
    write("update", [tripId, id, input], key, () => {
      const { settlementRevision, ...fields } = input;
      assert.equal(settlementRevision, state.revision);
      const index = state.expenses.findIndex((expense) => expense.id === id);
      assert.notEqual(index, -1);
      state.expenses[index] = { id, ...fields };
      changed();
      return {
        expense: state.expenses[index],
        settlementRevision: state.revision,
      };
    });
  fixture.repo.tripApi.removeExpense = async (
    tripId,
    id,
    expectedRevision,
    key,
  ) =>
    write("delete", [tripId, id, expectedRevision], key, () => {
      assert.equal(expectedRevision, state.revision);
      state.expenses = state.expenses.filter((expense) => expense.id !== id);
      changed();
      return { settlementRevision: state.revision };
    });
  fixture.repo.tripApi.confirmTransfer = async (tripId, input, key) =>
    write("confirm", [tripId, input], key, () => {
      assert.equal(input.settlementRevision, state.revision);
      const transferKey = `${input.settlementRevision}:${input.fromUserId}:${input.toUserId}:${input.amount}`;
      const old = state.confirmations.get(transferKey) ?? {
        completed: false,
        confirmationVersion: "0",
      };
      assert.equal(input.confirmationVersion, old.confirmationVersion);
      const next = {
        completed: input.completed,
        confirmationVersion: String(
          BigInt(old.confirmationVersion) +
            (old.completed !== input.completed ? 1n : 0n),
        ),
      };
      state.confirmations.set(transferKey, next);
      return { settlementRevision: state.revision, ...next };
    });
  return { ...fixture, state, financialCalls, responses };
}
const expenseSave = (expense, settlementRevision) => ({
  type: "item.save",
  tripId: "91",
  collection: "expenses",
  item: expense,
  settlementRevision,
});
const expenseDelete = (expenseId, settlementRevision) => ({
  type: "item.delete",
  tripId: "91",
  collection: "expenses",
  itemId: expenseId,
  settlementRevision,
});
const confirmTransfer = (trip, completed) => {
  const transfer = trip.serverSettlement.transfers[0];
  return {
    type: "transfer.confirm",
    tripId: trip.id,
    transferKey: transfer.key,
    completed,
    settlementRevision: trip.settlementRevision,
    confirmationVersion: transfer.confirmationVersion,
  };
};

test("Shared expense CRUD keeps bigint IDs, subgroup, notes, outside-trip dates and fixed shares across accounts", async () => {
  const { repo, state, account, values, financialCalls } =
    expenseRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  let workspace = await repo.execute(
    expenseSave(
      sharedExpense({
        id: "draft-expense",
        title: "가".repeat(150),
        shares: { 2: 30000 },
      }),
    ),
  );
  let trip = workspace.trips[0];
  assert.equal(trip.expenses[0].id, "9007199254741001");
  assert.equal(trip.expenses[0].date, "2026-09-01");
  assert.equal(trip.expenses[0].note, "예약 비용 포함");
  assert.deepEqual(trip.serverSettlement.balances["1"], {
    paid: 30000,
    share: 0,
    balance: 30000,
  });
  assert.equal(trip.settlementRevision, "1");
  assert.equal(financialCalls[0][2].id, undefined);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  trip = (await repo.load()).trips[0];
  assert.equal(trip.expenses[0].partyId, "301");
  workspace = await repo.execute(
    expenseSave(
      { ...trip.expenses[0], note: "멤버가 변경", shares: { 1: 0, 2: 30000 } },
      trip.settlementRevision,
    ),
  );
  trip = workspace.trips[0];
  assert.deepEqual(trip.expenses[0].shares, { 1: 0, 2: 30000 });
  assert.equal(trip.expenses[0].note, "멤버가 변경");
  assert.equal(trip.settlementRevision, "2");
  workspace = await repo.execute(
    expenseDelete(trip.expenses[0].id, trip.settlementRevision),
  );
  assert.deepEqual(workspace.trips[0].expenses, []);
  assert.equal(workspace.trips[0].serverSettlement.total, 0);
  assert.equal(state.revision, "3");
  assert.equal(values.size, 0);
});

test("Server expense reads preserve original device arrays and a separate backup without automatically uploading or merging", async () => {
  const { repo, values, state, financialCalls } = expenseRepositoryFixture();
  const key = "trip-device-notes-v1:http%3A%2F%2Flocalhost%3A8080%2Fapi:1";
  const original = JSON.stringify({
    91: {
      expenses: [sharedExpense({ id: "old-local", title: "기기 원본" })],
      confirmedTransfers: ["old-check"],
    },
  });
  values.set(key, original);
  state.expenses = [sharedExpense()];
  state.revision = "1";
  await repo.signIn("1@example.invalid", "dummy");
  let trip = (await repo.load()).trips[0];
  assert.equal(trip.expenses[0].title, "저녁 식사");
  assert.deepEqual(trip.confirmedTransfers, []);
  assert.equal(trip.legacyExpensesPreserved, true);
  assert.equal(values.get(`${key}:expense-backup-v1`), original);
  assert.equal(values.get(key), original);
  await repo.execute(
    planningSave("messages", {
      id: "notice",
      text: "여권을 챙겨요",
      authorId: "1",
      createdAt: "2026-10-02T00:00:00Z",
    }),
  );
  const persisted = JSON.parse(values.get(key))["91"];
  assert.equal(persisted.expenses[0].title, "기기 원본");
  assert.deepEqual(persisted.confirmedTransfers, ["old-check"]);
  assert.equal(values.get(`${key}:expense-backup-v1`), original);
  assert.deepEqual(financialCalls, []);
  state.expenses = [];
  state.revision = "2";
  trip = (await repo.load()).trips[0];
  assert.deepEqual(trip.expenses, []);
});

test("Only receivers complete and cancel shared transfers, including archived trips", async () => {
  const {
    repo,
    state,
    account,
    trip: serverTrip,
    financialCalls,
  } = expenseRepositoryFixture();
  state.expenses = [sharedExpense()];
  state.revision = "9007199254740993";
  await repo.signIn("1@example.invalid", "dummy");
  let trip = (await repo.load()).trips[0];
  trip = (await repo.execute(confirmTransfer(trip, true))).trips[0];
  assert.deepEqual(trip.confirmedTransfers, ["9007199254740993:2:1:20000"]);
  assert.equal(trip.serverSettlement.transfers[0].confirmationVersion, "1");
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  serverTrip.status = "ARCHIVED";
  trip = (await repo.load()).trips[0];
  assert.equal(trip.serverSettlement.transfers[0].completed, true);
  const callsBeforeSender = financialCalls.length;
  for (const completed of [true, false])
    await assert.rejects(
      repo.execute(confirmTransfer(trip, completed)),
      /받는 사람/,
    );
  assert.equal(financialCalls.length, callsBeforeSender);
  assert.equal(
    state.confirmations.get("9007199254740993:2:1:20000").completed,
    true,
  );
  await repo.signOut();
  account("1");
  await repo.signIn("1@example.invalid", "dummy");
  trip = (await repo.load()).trips[0];
  trip = (await repo.execute(confirmTransfer(trip, false))).trips[0];
  assert.deepEqual(trip.confirmedTransfers, []);
  assert.equal(trip.serverSettlement.transfers[0].confirmationVersion, "2");
  await assert.rejects(
    repo.execute(expenseSave(sharedExpense(), trip.settlementRevision)),
    /종료/,
  );
  serverTrip.status = "ACTIVE";
  trip = (await repo.load()).trips[0];
  trip = (await repo.execute(confirmTransfer(trip, true))).trips[0];
  trip = (
    await repo.execute(expenseSave(trip.expenses[0], trip.settlementRevision))
  ).trips[0];
  assert.equal(trip.settlementRevision, "9007199254740994");
  assert.deepEqual(trip.confirmedTransfers, []);
  assert.equal(
    state.confirmations.get("9007199254740993:2:1:20000").completed,
    true,
  );
  assert.deepEqual(
    financialCalls
      .filter((call) => call[0] === "confirm")
      .map((call) => call[2].completed),
    [true, false, true],
  );
});

for (const operation of ["create", "update", "delete", "confirm"]) {
  for (const failure of ["lost response", "failed reload"]) {
    test(`Expense ${operation} retries ${failure} with one UUID and unchanged expected versions`, async () => {
      const { repo, state, financialCalls } = expenseRepositoryFixture();
      if (operation !== "create") {
        state.expenses = [sharedExpense()];
        state.revision = "1";
      }
      await repo.signIn("1@example.invalid", "dummy");
      const trip = (await repo.load()).trips[0];
      const command =
        operation === "create"
          ? expenseSave(sharedExpense({ id: "draft-a" }))
          : operation === "update"
            ? expenseSave(
                sharedExpense({ note: "수정" }),
                trip.settlementRevision,
              )
            : operation === "delete"
              ? expenseDelete(sharedExpense().id, trip.settlementRevision)
              : confirmTransfer(trip, true);
      const method = {
        create: "createExpense",
        update: "updateExpense",
        delete: "removeExpense",
        confirm: "confirmTransfer",
      }[operation];
      const originalWrite = repo.tripApi[method];
      const originalRead = repo.tripApi.settlement;
      let attempts = 0,
        failRead = false;
      repo.tripApi[method] = async (...args) => {
        const result = await originalWrite(...args);
        attempts++;
        if (attempts === 1 && failure === "lost response")
          throw new Error("write response lost");
        if (attempts === 1 && failure === "failed reload") failRead = true;
        return result;
      };
      repo.tripApi.settlement = async () => {
        if (failRead) {
          failRead = false;
          throw new Error("reload failed");
        }
        return originalRead();
      };
      await assert.rejects(repo.execute(command), /lost|failed/);
      // Refresh can observe the committed write before the original request is replayed.
      await repo.load();
      const retry = structuredClone(command);
      if (operation === "create") retry.item.id = "draft-b";
      const workspace = await repo.execute(retry);
      assert.equal(financialCalls.length, 2);
      assert.equal(financialCalls[0].at(-1), financialCalls[1].at(-1));
      assert.deepEqual(
        financialCalls[0].slice(0, -1),
        financialCalls[1].slice(0, -1),
      );
      assert.equal(
        state.revision,
        operation === "confirm" ? "1" : operation === "create" ? "1" : "2",
      );
      assert.equal(
        workspace.trips[0].expenses.length,
        operation === "delete" ? 0 : 1,
      );
    });
  }
}

test("A replayed receiver completion response cannot revive a later cancellation", async () => {
  const { repo, state } = expenseRepositoryFixture();
  state.expenses = [sharedExpense()];
  state.revision = "1";
  await repo.signIn("1@example.invalid", "dummy");
  const trip = (await repo.load()).trips[0];
  const command = confirmTransfer(trip, true);
  const original = repo.tripApi.confirmTransfer;
  let attempts = 0;
  repo.tripApi.confirmTransfer = async (...args) => {
    const response = await original(...args);
    if (++attempts === 1) throw new Error("response lost");
    return response;
  };
  await assert.rejects(repo.execute(command), /lost/);
  state.confirmations.set(command.transferKey, {
    completed: false,
    confirmationVersion: "2",
  });
  const next = await repo.execute(command);
  assert.deepEqual(next.trips[0].confirmedTransfers, []);
  assert.equal(
    next.trips[0].serverSettlement.transfers[0].confirmationVersion,
    "2",
  );
});

test("Expense conflicts publish a fresh workspace and never automatically replay a stale choice", async () => {
  const { ApiError } = require("../src/data/user-api.ts");
  const {
    RepositoryConflictError,
  } = require("../src/data/user-travel-repository.ts");
  const { repo, state } = expenseRepositoryFixture();
  state.expenses = [sharedExpense()];
  state.revision = "1";
  await repo.signIn("1@example.invalid", "dummy");
  const trip = (await repo.load()).trips[0];
  state.expenses[0].note = "다른 멤버가 저장";
  state.revision = "2";
  let writes = 0;
  repo.tripApi.updateExpense = async () => {
    writes++;
    throw new ApiError(409, "SETTLEMENT_CHANGED", "지출이 변경됐어요.");
  };
  await assert.rejects(
    repo.execute(
      expenseSave(
        { ...trip.expenses[0], note: "내 작성 내용" },
        trip.settlementRevision,
      ),
    ),
    (error) => {
      assert.ok(error instanceof RepositoryConflictError);
      assert.equal(error.workspace.trips[0].settlementRevision, "2");
      assert.equal(
        error.workspace.trips[0].expenses[0].note,
        "다른 멤버가 저장",
      );
      return true;
    },
  );
  assert.equal(writes, 1);
  assert.equal(state.expenses[0].note, "다른 멤버가 저장");
  assert.equal(trip.expenses[0].note, "예약 비용 포함");
});

test("Expense loading requires one revision, retries boundedly, and retains the old snapshot on API failure", async () => {
  const { repo, state } = expenseRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  let calls = 0;
  const read = repo.tripApi.expenses;
  repo.tripApi.expenses = async (...args) => {
    const result = await read(...args);
    if (++calls === 1) result.settlementRevision = "999";
    return result;
  };
  const old = await repo.load();
  assert.equal(calls, 2);
  assert.equal(old.trips[0].settlementRevision, "0");
  repo.tripApi.settlement = async () => {
    throw new Error("settlement unavailable");
  };
  await assert.rejects(repo.load(), /unavailable/);
  assert.equal(repo.snapshot, old);
  calls = 0;
  repo.tripApi.expenses = async () => {
    calls++;
    return { items: [], settlementRevision: "10" };
  };
  repo.tripApi.settlement = async () => ({
    settlementRevision: "11",
    total: 0,
    balances: {},
    transfers: [],
  });
  await assert.rejects(repo.load(), /잠시 후/);
  assert.equal(calls, 3);
  assert.equal(state.revision, "0");
  assert.equal(repo.snapshot, old);
});

test("Expense validation matches DB field lengths and keeps zero shares and payers outside the split", async () => {
  const { repo, financialCalls } = expenseRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  for (const fields of [
    { title: "가".repeat(151) },
    { note: "가".repeat(1001) },
    { amount: 0 },
    { amount: 1.2 },
    { amount: 1000000001 },
    { date: "2026-02-30" },
    { payerId: "99" },
    { shares: { 99: 30000 } },
    { shares: { 1: 1 } },
    { shares: { 1: -1, 2: 30001 } },
    { partyId: "other-trip" },
  ])
    await assert.rejects(
      repo.execute(expenseSave(sharedExpense({ id: "draft", ...fields }))),
    );
  assert.equal(financialCalls.length, 0);
  const next = await repo.execute(
    expenseSave(
      sharedExpense({ id: "valid-draft", shares: { 1: 0, 2: 30000 } }),
    ),
  );
  assert.equal(next.trips[0].expenses[0].shares["1"], 0);
});

test("Pending expense creates are never retried after the server's 24-hour idempotency retention", async (t) => {
  const { repo, state, financialCalls } = expenseRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const start = Date.now();
  let now = start;
  t.mock.method(Date, "now", () => now);
  const write = repo.tripApi.createExpense;
  repo.tripApi.createExpense = async (...args) => {
    await write(...args);
    throw new Error("lost");
  };
  const command = expenseSave(sharedExpense({ id: "draft" }));
  await assert.rejects(repo.execute(command), /lost/);
  now += 24 * 60 * 60 * 1000;
  await assert.rejects(repo.execute(command), /저장 확인 시간이/);
  await assert.rejects(repo.execute(command), /저장 확인 시간이/);
  assert.equal(financialCalls.length, 1);
  assert.equal(state.expenses.length, 1);
});

test("Expense APIs paginate all revision-bound pages, preserve encoded cursors and reject unsafe monetary values", async () => {
  const { TripApi } = require("../src/data/trip-api.ts");
  const calls = [];
  const data = {
    request: async (path) => {
      calls.push(path);
      return path.includes("cursor=")
        ? {
            items: [sharedExpense({ id: "9007199254741002" })],
            nextCursor: null,
            settlementRevision: "9007199254740993",
          }
        : {
            items: [sharedExpense()],
            nextCursor: "9007199254740993:a+/=",
            settlementRevision: "9007199254740993",
          };
    },
  };
  const api = new TripApi(data);
  const result = await api.expenses("91");
  assert.equal(result.items.length, 2);
  assert.equal(result.settlementRevision, "9007199254740993");
  assert.ok(calls[1].includes("cursor=9007199254740993%3Aa%2B%2F%3D"));
  data.request = async () => ({
    items: [sharedExpense({ amount: Number.MAX_SAFE_INTEGER + 1 })],
    nextCursor: null,
    settlementRevision: "1",
  });
  await assert.rejects(api.expenses("91"), /응답 형식/);
  data.request = async () => ({
    settlementRevision: "1",
    total: Number.MAX_SAFE_INTEGER + 1,
    balances: {},
    transfers: [],
  });
  await assert.rejects(api.settlement("91"), /응답 형식/);
});

test("Expense writes carry idempotency keys, expected revisions and explicit confirmation versions in HTTP contracts", async () => {
  const { TripApi } = require("../src/data/trip-api.ts");
  const calls = [];
  const api = new TripApi({
    request: async (...args) => {
      calls.push(args);
      return {};
    },
  });
  const { id, ...input } = sharedExpense();
  await api.createExpense("91", input, "create-key");
  await api.updateExpense(
    "91",
    id,
    { ...input, settlementRevision: "9007199254740993" },
    "update-key",
  );
  await api.removeExpense("91", id, "9007199254740993", "delete-key");
  const confirmation = {
    settlementRevision: "9007199254740993",
    fromUserId: "2",
    toUserId: "1",
    amount: 20000,
    completed: false,
    confirmationVersion: "7",
  };
  await api.confirmTransfer("91", confirmation, "confirm-key");
  assert.deepEqual(
    calls.map((call) => call[1]),
    ["POST", "PUT", "DELETE", "PUT"],
  );
  assert.deepEqual(
    calls.map((call) => call[3]["Idempotency-Key"]),
    ["create-key", "update-key", "delete-key", "confirm-key"],
  );
  assert.ok(calls[2][0].endsWith("?settlementRevision=9007199254740993"));
  assert.equal(calls[2][2], undefined);
  assert.deepEqual(calls[3][2], confirmation);
});

test("Mock transfer confirmation accepts an explicit goal without toggling it on retries", () => {
  const workspace = seed();
  const transfer = calculateSettlement(workspace.trips[0]).transfers[0];
  const command = {
    type: "transfer.confirm",
    tripId: workspace.trips[0].id,
    transferKey: transfer.key,
    completed: true,
  };
  const first = applyCommand(workspace, transfer.to, command);
  const second = applyCommand(first, transfer.to, command);
  assert.deepEqual(second.trips[0].confirmedTransfers, [transfer.key]);
  const cancelled = applyCommand(second, transfer.to, {
    ...command,
    completed: false,
  });
  assert.deepEqual(cancelled.trips[0].confirmedTransfers, []);
});

const packingToken = (item) =>
  require("node:crypto")
    .createHash("sha256")
    .update(
      JSON.stringify([item.id, "91", item.title, item.ownerId, item.done]),
    )
    .digest("hex");
const packingItem = (fields = {}) => {
  const item = {
    id: "9007199254741010",
    title: "여권",
    ownerId: "1",
    done: false,
    ...fields,
  };
  return {
    ...item,
    stateToken: Object.hasOwn(fields, "stateToken")
      ? fields.stateToken
      : packingToken(item),
  };
};
const packingSave = (item) => planningSave("checklist", item);
const packingComplete = (item, done) => ({
  type: "checklist.complete",
  tripId: "91",
  itemId: item.id,
  done,
  expectedStateToken: item.stateToken,
});
const packingDelete = (item) => ({
  type: "item.delete",
  tripId: "91",
  collection: "checklist",
  itemId: item.id,
  expectedStateToken: item.stateToken,
});
function packingRepositoryFixture() {
  const f = restoredRepositoryFixture();
  const { ApiError } = require("../src/data/user-api.ts");
  const state = { items: [], mutations: [] },
    packingCalls = [],
    replay = new Map();
  let nextPackingId = 9007199254741010n;
  f.repo.tripApi.packingItems = async () => ({
    items: structuredClone(state.items),
    checklistStateToken: "a".repeat(64),
  });
  const perform = (operation, tripId, itemId, input, key) => {
    packingCalls.push([operation, tripId, itemId, structuredClone(input), key]);
    const old = state.items.find((item) => item.id === itemId);
    if (operation === "complete" && old?.ownerId === null)
      throw new ApiError(
        409,
        "PACKING_ASSIGNMENT_REQUIRED",
        "담당자가 없는 준비물은 먼저 담당자를 지정해 주세요.",
      );
    if (
      operation === "complete" &&
      old &&
      old.ownerId !== null &&
      old.ownerId !== f.repo.session.user.id
    )
      throw new ApiError(
        403,
        "PACKING_OWNER_REQUIRED",
        "배정된 준비물은 담당자만 완료 상태를 변경할 수 있어요.",
      );
    if (replay.has(key)) return structuredClone(replay.get(key));
    if (f.trip.status === "ARCHIVED")
      throw new ApiError(409, "TRIP_ARCHIVED", "보관된 여행이에요.");
    if (operation !== "create") {
      if (!old)
        throw new ApiError(
          404,
          "PACKING_ITEM_NOT_FOUND",
          "준비물을 찾을 수 없어요.",
        );
      if (old.stateToken !== input.expectedStateToken)
        throw new ApiError(
          409,
          "PACKING_ITEM_CONFLICT",
          "다른 멤버가 준비물을 변경했어요.",
        );
    }
    let result;
    if (operation === "create") {
      const owners = input.ownerId === null ? ["1", "2"] : [input.ownerId];
      const items = owners.map((ownerId) => {
        while (state.items.some((item) => item.id === String(nextPackingId)))
          nextPackingId++;
        return packingItem({
          ...input,
          id: String(nextPackingId++),
          ownerId,
          done: false,
        });
      });
      result = { items };
      state.items.push(...items);
    } else if (operation === "delete") {
      state.items = state.items.filter((item) => item.id !== itemId);
      result = { deletedId: itemId };
    } else {
      if (operation === "update" && input.ownerId === null)
        throw new ApiError(
          400,
          "PACKING_ASSIGNMENT_REQUIRED",
          "수정할 준비물의 담당자를 선택해 주세요.",
        );
      const { stateToken: previousToken, ...previous } = old;
      result = packingItem(
        operation === "complete"
          ? { ...previous, done: input.done }
          : {
              ...previous,
              title: input.title,
              ownerId: input.ownerId,
              done: old.ownerId === null ? false : old.done,
            },
      );
      state.items = state.items.map((item) =>
        item.id === itemId ? result : item,
      );
    }
    state.mutations.push(operation);
    replay.set(key, result);
    return structuredClone(result);
  };
  f.repo.tripApi.createPackingItem = async (tripId, input, key) =>
    perform("create", tripId, "", input, key);
  f.repo.tripApi.updatePackingItem = async (tripId, itemId, input, key) =>
    perform("update", tripId, itemId, input, key);
  f.repo.tripApi.completePackingItem = async (tripId, itemId, input, key) =>
    perform("complete", tripId, itemId, input, key);
  f.repo.tripApi.removePackingItem = async (
    tripId,
    itemId,
    expectedStateToken,
    key,
  ) => perform("delete", tripId, itemId, { expectedStateToken }, key);
  return { ...f, state, packingCalls };
}

test("All-member checklist creation uses independent bigint items and per-person completion across accounts", async () => {
  const { repo, state, packingCalls, account, values } =
    packingRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  let trip = (
    await repo.execute(
      packingSave(
        packingItem({
          id: "draft-one",
          title: "  여권  ",
          ownerId: null,
          stateToken: undefined,
        }),
      ),
    )
  ).trips[0];
  assert.equal(trip.checklist[0].title, "여권");
  assert.equal(trip.checklist[0].id, "9007199254741010");
  assert.equal(trip.checklist[0].done, false);
  assert.equal(trip.checklist.length, 2);
  assert.deepEqual(
    trip.checklist.map((item) => item.ownerId),
    ["1", "2"],
  );
  assert.deepEqual(packingCalls[0][3], { title: "여권", ownerId: null });
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  trip = (await repo.load()).trips[0];
  const ownItem = () => trip.checklist.find((item) => item.ownerId === "2");
  trip = (await repo.execute(packingComplete(ownItem(), true))).trips[0];
  assert.equal(ownItem().done, true);
  assert.equal(trip.checklist.find((item) => item.ownerId === "1").done, false);
  assert.deepEqual(Object.keys(packingCalls[1][3]).sort(), [
    "done",
    "expectedStateToken",
  ]);
  trip = (
    await repo.execute(
      packingSave({
        ...ownItem(),
        title: "회원이 수정",
        ownerId: "2",
        done: false,
      }),
    )
  ).trips[0];
  assert.equal(ownItem().done, true);
  assert.equal(ownItem().ownerId, "2");
  assert.equal(packingCalls[2][3].done, undefined);
  trip = (await repo.execute(packingComplete(ownItem(), false))).trips[0];
  assert.equal(ownItem().done, false);
  trip = (await repo.execute(packingDelete(ownItem()))).trips[0];
  assert.equal(trip.checklist.length, 1);
  assert.equal(trip.checklist[0].ownerId, "1");
  assert.equal(trip.checklist[0].done, false);
  assert.equal(state.mutations.length, 5);
  assert.equal(values.size, 0);
});

for (const failure of ["lost response", "failed reload"])
  test(`All-member packing ${failure} retries preserve exactly one item per member`, async () => {
    const { repo, state, packingCalls } = packingRepositoryFixture();
    await repo.signIn("1@example.invalid", "dummy");
    await repo.load();
    const command = packingSave(
      packingItem({
        id: "all-retry",
        ownerId: null,
        stateToken: undefined,
      }),
    );
    const create = repo.tripApi.createPackingItem;
    const read = repo.tripApi.packingItems;
    if (failure === "lost response")
      repo.tripApi.createPackingItem = async (...args) => {
        await create(...args);
        throw new Error("lost response");
      };
    else
      repo.tripApi.packingItems = async () => {
        throw new Error("failed reload");
      };
    await assert.rejects(repo.execute(command), new RegExp(failure));
    assert.equal(state.items.length, 2);
    repo.tripApi.createPackingItem = create;
    repo.tripApi.packingItems = read;
    const result = await repo.execute(command);
    assert.equal(state.mutations.length, 1);
    assert.deepEqual(
      result.trips[0].checklist.map((item) => item.ownerId),
      ["1", "2"],
    );
    assert.equal(packingCalls.length, failure === "lost response" ? 2 : 1);
    if (packingCalls.length === 2)
      assert.equal(packingCalls[0][4], packingCalls[1][4]);
  });

test("Unassigned packing requires assignment before checking and starts incomplete after assignment", async () => {
  const { repo, state, packingCalls } = packingRepositoryFixture();
  state.items = [packingItem({ ownerId: null, done: true })];
  await repo.signIn("1@example.invalid", "dummy");
  const item = (await repo.load()).trips[0].checklist[0];
  for (const done of [true, false])
    await assert.rejects(
      repo.execute(packingComplete(item, done)),
      /담당자가 없는/,
    );
  assert.equal(packingCalls.length, 0);
  assert.equal(state.items[0].done, true);
  const assigned = await repo.execute(packingSave({ ...item, ownerId: "1" }));
  assert.equal(assigned.trips[0].checklist[0].done, false);
  await assert.rejects(
    repo.execute(
      packingSave({ ...assigned.trips[0].checklist[0], ownerId: null }),
    ),
    /담당자를 선택/,
  );
  assert.equal(packingCalls.length, 1);
});

test("Packing create validates assigned batch items and rejects old common replay envelopes", async () => {
  const { TripApi } = require("../src/data/trip-api.ts");
  const own = packingItem(),
    other = packingItem({ id: "9007199254741011", ownerId: "2" });
  let response = { items: [own, other] };
  const api = new TripApi({ request: async () => response });
  assert.deepEqual(
    await api.createPackingItem("91", { title: "여권", ownerId: null }, "key"),
    response,
  );
  for (const items of [
    [],
    [own, own],
    [own, { ...other, ownerId: "1" }],
    [packingItem({ ownerId: null })],
    [{ ...own, id: 9007199254741010 }],
  ]) {
    response = { items };
    await assert.rejects(
      api.createPackingItem("91", { title: "여권", ownerId: null }, "key"),
      /응답 형식/,
    );
  }
  response = { items: [packingItem({ ownerId: null })], legacy: true };
  await assert.rejects(
    api.createPackingItem("91", { title: "여권", ownerId: null }, "key"),
    /응답 형식/,
  );
  response = { items: [other] };
  await assert.rejects(
    api.createPackingItem("91", { title: "여권", ownerId: "1" }, "key"),
    /응답 형식/,
  );
});

test("Assigned checklist completion is blocked before API calls for other members and trip owners", async () => {
  for (const owner of ["1", "2"]) {
    const { repo, state, packingCalls, account } = packingRepositoryFixture();
    const other = owner === "1" ? "2" : "1";
    state.items = [packingItem({ ownerId: owner })];
    account(other);
    await repo.signIn(`${other}@example.invalid`, "dummy");
    let item = (await repo.load()).trips[0].checklist[0];
    for (const done of [true, false])
      await assert.rejects(
        repo.execute(packingComplete(item, done)),
        (error) =>
          error.status === 403 && error.code === "PACKING_OWNER_REQUIRED",
      );
    assert.equal(packingCalls.length, 0);
    assert.equal(state.items[0].done, false);
    await repo.signOut();
    account(owner);
    await repo.signIn(`${owner}@example.invalid`, "dummy");
    item = (await repo.load()).trips[0].checklist[0];
    await repo.execute(packingComplete(item, true));
    assert.equal(state.items[0].done, true);
    await repo.signOut();
    account(other);
    await repo.signIn(`${other}@example.invalid`, "dummy");
    item = (await repo.load()).trips[0].checklist[0];
    for (const done of [true, false])
      await assert.rejects(
        repo.execute(packingComplete(item, done)),
        /담당자만/,
      );
    assert.equal(packingCalls.length, 1);
    assert.equal(state.items[0].done, true);
    await repo.signOut();
    account(owner);
    await repo.signIn(`${owner}@example.invalid`, "dummy");
    item = (await repo.load()).trips[0].checklist[0];
    await repo.execute(packingComplete(item, false));
    assert.equal(packingCalls.length, 2);
    assert.equal(state.items[0].done, false);
  }
});

test("Checklist completion retries recheck assignment after a lost response or a failed reload", async () => {
  for (const failure of ["lost response", "failed reload"]) {
    const { repo, state, packingCalls } = packingRepositoryFixture();
    state.items = [packingItem({ ownerId: "1" })];
    await repo.signIn("1@example.invalid", "dummy");
    const item = (await repo.load()).trips[0].checklist[0];
    const command = packingComplete(item, true);
    const complete = repo.tripApi.completePackingItem;
    const read = repo.tripApi.packingItems;
    if (failure === "lost response")
      repo.tripApi.completePackingItem = async (...args) => {
        await complete(...args);
        throw new Error("lost response");
      };
    else
      repo.tripApi.packingItems = async () => {
        throw new Error("failed reload");
      };
    await assert.rejects(repo.execute(command), new RegExp(failure));
    assert.equal(packingCalls.length, 1);
    assert.equal(state.items[0].done, true);
    state.items = [packingItem({ ownerId: "2", done: true })];
    repo.tripApi.completePackingItem = complete;
    repo.tripApi.packingItems = read;
    await repo.load();
    await assert.rejects(repo.execute(command), /담당자만/);
    assert.equal(packingCalls.length, 1);
    assert.equal(state.items[0].done, true);
  }
});

test("A server completion permission rejection refreshes a stale assignment without changing its status", async () => {
  const {
    RepositoryConflictError,
  } = require("../src/data/user-travel-repository.ts");
  const { repo, state, packingCalls } = packingRepositoryFixture();
  state.items = [packingItem({ ownerId: "1" })];
  await repo.signIn("1@example.invalid", "dummy");
  const item = (await repo.load()).trips[0].checklist[0];
  state.items = [packingItem({ ownerId: "2" })];
  await assert.rejects(repo.execute(packingComplete(item, true)), (error) => {
    assert.ok(error instanceof RepositoryConflictError);
    assert.match(error.message, /담당자만/);
    assert.equal(error.workspace.trips[0].checklist[0].ownerId, "2");
    return true;
  });
  assert.equal(packingCalls.length, 1);
  assert.equal(state.items[0].done, false);
  assert.equal(repo.snapshot.trips[0].checklist[0].ownerId, "2");
  await assert.rejects(repo.execute(packingComplete(item, true)), /담당자만/);
  assert.equal(packingCalls.length, 1);
});

test("Checklist reads preserve device originals and one untouched backup without uploading or merging them", async () => {
  const { repo, values, state, packingCalls, account } =
    packingRepositoryFixture();
  const key = "trip-device-notes-v1:http%3A%2F%2Flocalhost%3A8080%2Fapi:1";
  const original = JSON.stringify({
    91: {
      checklist: [
        { id: "old-device", title: "기기 원본", ownerId: null, done: true },
      ],
      notices: [],
    },
  });
  values.set(key, original);
  state.items = [packingItem()];
  await repo.signIn("1@example.invalid", "dummy");
  let trip = (await repo.load()).trips[0];
  assert.deepEqual(trip.checklist, state.items);
  assert.equal(trip.legacyChecklistPreserved, true);
  assert.equal(values.get(`${key}:checklist-backup-v1`), original);
  assert.equal(values.get(key), original);
  await repo.execute(
    planningSave("messages", {
      id: "notice",
      text: "여권을 챙겨요",
      authorId: "1",
      createdAt: "2026-10-02T00:00:00Z",
    }),
  );
  assert.equal(JSON.parse(values.get(key))["91"].checklist[0].id, "old-device");
  assert.equal(values.get(`${key}:checklist-backup-v1`), original);
  const replaced = JSON.parse(values.get(key));
  delete replaced["91"].checklist;
  values.set(key, JSON.stringify(replaced));
  state.items = [];
  trip = (await repo.load()).trips[0];
  assert.deepEqual(trip.checklist, []);
  assert.equal(trip.legacyChecklistPreserved, true);
  assert.deepEqual(packingCalls, []);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  assert.equal((await repo.load()).trips[0].legacyChecklistPreserved, false);
});

for (const operation of ["create", "update", "complete", "delete"]) {
  for (const failure of ["lost response", "failed reload"]) {
    test(`Checklist ${operation} retries ${failure} with the same original token and one committed mutation`, async () => {
      const {
        repo,
        state,
        packingCalls,
        trip: serverTrip,
      } = packingRepositoryFixture();
      if (operation !== "create") state.items = [packingItem()];
      await repo.signIn("1@example.invalid", "dummy");
      const old = (await repo.load()).trips[0].checklist[0];
      const command =
        operation === "create"
          ? packingSave(packingItem({ id: "draft-a", stateToken: undefined }))
          : operation === "update"
            ? packingSave({ ...old, title: "수정" })
            : operation === "complete"
              ? packingComplete(old, true)
              : packingDelete(old);
      const method = {
        create: "createPackingItem",
        update: "updatePackingItem",
        complete: "completePackingItem",
        delete: "removePackingItem",
      }[operation];
      const write = repo.tripApi[method],
        read = repo.tripApi.packingItems;
      let writes = 0,
        failRead = false;
      repo.tripApi[method] = async (...args) => {
        const result = await write(...args);
        if (++writes === 1) {
          if (failure === "lost response")
            throw new Error("write response lost");
          failRead = true;
        }
        return result;
      };
      repo.tripApi.packingItems = async (...args) => {
        if (failRead) {
          failRead = false;
          throw new Error("reload failed");
        }
        return read(...args);
      };
      await assert.rejects(repo.execute(command), /lost|failed/);
      serverTrip.status = "ARCHIVED";
      await repo.load();
      const retry = structuredClone(command);
      if (operation === "create") retry.item.id = "draft-with-new-uid";
      const result = await repo.execute(retry);
      assert.equal(state.mutations.length, 1);
      assert.equal(packingCalls.length, failure === "lost response" ? 2 : 1);
      assert.match(
        packingCalls[0][4],
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
      );
      if (failure === "lost response") {
        assert.equal(packingCalls[0][4], packingCalls[1][4]);
        assert.deepEqual(packingCalls[0][3], packingCalls[1][3]);
      }
      assert.deepEqual(result.trips[0].checklist, state.items);
    });
  }
}

test("A replayed checklist completion response never restores a later undone state", async () => {
  const { repo, state, packingCalls } = packingRepositoryFixture();
  state.items = [packingItem()];
  await repo.signIn("1@example.invalid", "dummy");
  const command = packingComplete(
    (await repo.load()).trips[0].checklist[0],
    true,
  );
  const write = repo.tripApi.completePackingItem;
  let attempts = 0;
  repo.tripApi.completePackingItem = async (...args) => {
    const result = await write(...args);
    if (++attempts === 1) throw new Error("lost");
    return result;
  };
  await assert.rejects(repo.execute(command), /lost/);
  state.items = [packingItem({ done: false, title: "다른 멤버가 수정" })];
  await repo.load();
  const next = await repo.execute(command);
  assert.equal(next.trips[0].checklist[0].done, false);
  assert.equal(next.trips[0].checklist[0].title, "다른 멤버가 수정");
  assert.equal(packingCalls.length, 2);
  assert.equal(state.mutations.length, 1);
});

test("Checklist conflicts and deleted rows publish the newest list while keeping stale writes rejected", async () => {
  const {
    RepositoryConflictError,
  } = require("../src/data/user-travel-repository.ts");
  const { repo, state, packingCalls } = packingRepositoryFixture();
  state.items = [packingItem()];
  await repo.signIn("1@example.invalid", "dummy");
  const original = (await repo.load()).trips[0].checklist[0];
  state.items = [packingItem({ title: "다른 멤버가 변경" })];
  const command = packingSave({ ...original, title: "내 초안" });
  await assert.rejects(repo.execute(command), (error) => {
    assert.ok(error instanceof RepositoryConflictError);
    assert.equal(
      error.workspace.trips[0].checklist[0].title,
      "다른 멤버가 변경",
    );
    return true;
  });
  assert.equal(command.item.title, "내 초안");
  assert.equal(packingCalls.length, 1);
  assert.equal(state.mutations.length, 0);
  state.items = [];
  await assert.rejects(repo.execute(packingDelete(original)), (error) => {
    assert.ok(error instanceof RepositoryConflictError);
    assert.deepEqual(error.workspace.trips[0].checklist, []);
    return true;
  });
  assert.equal(packingCalls.length, 2);
  assert.deepEqual(repo.snapshot.trips[0].checklist, []);
});

test("Checklist rejects invalid fields, missing captured tokens and archived writes before sending mutations", async () => {
  const { repo, state, packingCalls, trip } = packingRepositoryFixture();
  state.items = [packingItem()];
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  for (const fields of [
    { title: " " },
    { title: "가".repeat(151) },
    { ownerId: "99" },
    { done: "true" },
  ])
    await assert.rejects(
      repo.execute(
        packingSave(
          packingItem({ id: "draft", stateToken: undefined, ...fields }),
        ),
      ),
    );
  await assert.rejects(
    repo.execute(packingSave({ ...state.items[0], stateToken: undefined })),
    /다시 불러온/,
  );
  await assert.rejects(
    repo.execute({
      ...packingComplete(state.items[0], true),
      expectedStateToken: undefined,
    }),
    /다시 불러온/,
  );
  await assert.rejects(
    repo.execute({ ...packingComplete(state.items[0], true), done: "true" }),
  );
  await assert.rejects(
    repo.execute({
      ...packingDelete(state.items[0]),
      expectedStateToken: "bad",
    }),
    /다시 불러온/,
  );
  assert.equal(packingCalls.length, 0);
  let next = await repo.execute(
    packingSave(
      packingItem({
        id: "valid",
        stateToken: undefined,
        title: "가".repeat(150),
        ownerId: "2",
      }),
    ),
  );
  assert.equal(next.trips[0].checklist[1].title.length, 150);
  trip.status = "ARCHIVED";
  await repo.load();
  await assert.rejects(
    repo.execute(
      packingSave(packingItem({ id: "new", stateToken: undefined })),
    ),
    /보관|종료/,
  );
  await assert.rejects(
    repo.execute(packingComplete(state.items[0], true)),
    /보관|종료/,
  );
  assert.equal(packingCalls.length, 1);
});

test("Expired checklist creation refreshes before allowing a fresh form with the same input and never resends the expired command", async (t) => {
  const {
    RepositoryConflictError,
  } = require("../src/data/user-travel-repository.ts");
  const { repo, packingCalls, state } = packingRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const write = repo.tripApi.createPackingItem;
  repo.tripApi.createPackingItem = async (...args) => {
    await write(...args);
    throw new Error("lost");
  };
  const command = packingSave(
    packingItem({ id: "draft", stateToken: undefined }),
  );
  await assert.rejects(repo.execute(command), /lost/);
  now += 24 * 60 * 60 * 1000;
  const read = repo.tripApi.packingItems;
  repo.tripApi.packingItems = async () => {
    throw new Error("latest list unavailable");
  };
  await assert.rejects(repo.execute(command), /unavailable/);
  assert.equal(repo.pendingPackingWrites.size, 1);
  assert.equal(packingCalls.length, 1);
  repo.tripApi.packingItems = read;
  await assert.rejects(repo.execute(command), (error) => {
    assert.ok(error instanceof RepositoryConflictError);
    assert.equal(error.code, "PACKING_RETRY_EXPIRED");
    assert.deepEqual(error.workspace.trips[0].checklist, state.items);
    return true;
  });
  assert.equal(packingCalls.length, 1);
  assert.equal(state.items.length, 1);
  assert.equal(repo.pendingPackingWrites.size, 0);
  repo.tripApi.createPackingItem = write;
  await repo.execute({
    ...command,
    item: { ...command.item, id: "explicitly-new-form" },
  });
  assert.equal(packingCalls.length, 2);
  assert.equal(state.items.length, 2);
  assert.notEqual(packingCalls[0][4], packingCalls[1][4]);
});

test("Expired checklist completion exposes the latest state and never automatically repeats the old goal", async (t) => {
  const {
    RepositoryConflictError,
  } = require("../src/data/user-travel-repository.ts");
  const { repo, packingCalls, state } = packingRepositoryFixture();
  state.items = [packingItem()];
  await repo.signIn("1@example.invalid", "dummy");
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const command = packingComplete(
    (await repo.load()).trips[0].checklist[0],
    true,
  );
  const write = repo.tripApi.completePackingItem;
  repo.tripApi.completePackingItem = async (...args) => {
    await write(...args);
    throw new Error("lost");
  };
  await assert.rejects(repo.execute(command), /lost/);
  state.items = [
    packingItem({ title: "다른 멤버가 수정하고 완료 취소", done: false }),
  ];
  now += 24 * 60 * 60 * 1000;
  await assert.rejects(repo.execute(command), (error) => {
    assert.ok(error instanceof RepositoryConflictError);
    assert.equal(error.code, "PACKING_RETRY_EXPIRED");
    assert.equal(error.workspace.trips[0].checklist[0].done, false);
    assert.equal(
      error.workspace.trips[0].checklist[0].stateToken,
      state.items[0].stateToken,
    );
    return true;
  });
  assert.equal(packingCalls.length, 1);
  assert.equal(state.items[0].done, false);
  repo.tripApi.completePackingItem = write;
  await repo.execute(
    packingComplete(repo.snapshot.trips[0].checklist[0], true),
  );
  assert.equal(state.items[0].done, true);
  assert.equal(packingCalls.length, 2);
  assert.notEqual(packingCalls[0][4], packingCalls[1][4]);
});

test("New checklist sessions discard pending creation keys without reusing another account's request", async () => {
  const { repo, packingCalls, account } = packingRepositoryFixture();
  await repo.signIn("1@example.invalid", "dummy");
  await repo.load();
  const write = repo.tripApi.createPackingItem;
  repo.tripApi.createPackingItem = async (...args) => {
    await write(...args);
    throw new Error("lost");
  };
  const command = packingSave(
    packingItem({ id: "draft", stateToken: undefined }),
  );
  await assert.rejects(repo.execute(command), /lost/);
  await repo.signOut();
  account("2");
  await repo.signIn("2@example.invalid", "dummy");
  await repo.load();
  repo.tripApi.createPackingItem = write;
  await repo.execute({
    ...command,
    item: { ...command.item, id: "other-draft" },
  });
  assert.notEqual(packingCalls[0][4], packingCalls[1][4]);
});

test("Checklist loading keeps the last complete snapshot on failures rather than publishing partial pages", async () => {
  const { repo, state } = packingRepositoryFixture();
  state.items = [packingItem()];
  await repo.signIn("1@example.invalid", "dummy");
  const old = await repo.load();
  repo.tripApi.packingItems = async () => {
    throw new Error("packing unavailable");
  };
  await assert.rejects(repo.load(), /unavailable/);
  assert.equal(repo.snapshot, old);
  assert.equal(repo.snapshot.trips[0].checklist.length, 1);
});

test("Packing API restarts changing snapshots, safely sorts all pages and preserves encoded bigint cursors", async () => {
  const { TripApi } = require("../src/data/trip-api.ts"),
    { ApiError } = require("../src/data/user-api.ts");
  const calls = [],
    token = "a".repeat(64);
  let firstPages = 0;
  const api = new TripApi({
    request: async (path) => {
      calls.push(path);
      if (!path.includes("cursor=")) {
        firstPages++;
        return {
          items: [packingItem({ id: "9007199254741010", done: true })],
          nextCursor: "a+/=:9007199254741010",
          checklistStateToken: token,
        };
      }
      if (firstPages === 1)
        throw new ApiError(409, "PACKING_LIST_CHANGED", "changed");
      return {
        items: [
          packingItem({ id: "9007199254741011" }),
          packingItem({ id: "9007199254741012" }),
        ],
        nextCursor: null,
        checklistStateToken: token,
      };
    },
  });
  const result = await api.packingItems("9007199254740997");
  assert.equal(firstPages, 2);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["9007199254741011", "9007199254741012", "9007199254741010"],
  );
  assert.equal(result.checklistStateToken, token);
  assert.equal(calls.length, 4);
  assert.ok(calls[1].endsWith("cursor=a%2B%2F%3D%3A9007199254741010"));
});

test("Packing pagination bounds changing snapshots to three attempts and rejects malformed or repeated pages", async () => {
  const { TripApi } = require("../src/data/trip-api.ts"),
    { ApiError } = require("../src/data/user-api.ts");
  let attempts = 0;
  const data = {
      request: async () => {
        attempts++;
        throw new ApiError(409, "PACKING_LIST_CHANGED", "changed");
      },
    },
    api = new TripApi(data);
  await assert.rejects(api.packingItems("91"), /잠시 후/);
  assert.equal(attempts, 3);
  for (const item of [
    packingItem({ id: 9007199254741010 }),
    packingItem({ ownerId: 2 }),
    packingItem({ done: "true" }),
    packingItem({ stateToken: "invalid" }),
    packingItem({ title: " " }),
  ]) {
    data.request = async () => ({
      items: [item],
      nextCursor: null,
      checklistStateToken: "a".repeat(64),
    });
    await assert.rejects(api.packingItems("91"), /응답 형식/);
  }
  data.request = async () => ({
    items: [packingItem()],
    nextCursor: "same",
    checklistStateToken: "a".repeat(64),
  });
  await assert.rejects(api.packingItems("91"), /응답 형식/);
  let pages = 0;
  data.request = async () => ({
    items: [packingItem({ id: String(9007199254741010n + BigInt(pages++)) })],
    nextCursor: pages % 2 ? "next" : null,
    checklistStateToken: (pages % 2 ? "a" : "b").repeat(64),
  });
  await assert.rejects(api.packingItems("91"), /잠시 후/);
  assert.equal(pages, 6);
});

test("Packing item read and all write contracts use exact bodies, tokens, explicit completion and idempotency keys", async () => {
  const { TripApi } = require("../src/data/trip-api.ts"),
    calls = [];
  const item = packingItem(),
    input = { title: item.title, ownerId: item.ownerId };
  const api = new TripApi({
    request: async (...args) => {
      calls.push(args);
      return args[1] === "POST" ? { items: [item] } : item;
    },
  });
  assert.deepEqual(await api.packingItem("91", item.id), item);
  await api.createPackingItem("91", input, "create-key");
  await api.updatePackingItem(
    "91",
    item.id,
    { ...input, expectedStateToken: item.stateToken },
    "update-key",
  );
  await api.completePackingItem(
    "91",
    item.id,
    { done: false, expectedStateToken: item.stateToken },
    "complete-key",
  );
  await api.removePackingItem("91", item.id, item.stateToken, "delete-key");
  assert.deepEqual(
    calls.slice(1).map((call) => call[1]),
    ["POST", "PUT", "PUT", "DELETE"],
  );
  assert.deepEqual(
    calls.slice(1).map((call) => call[3]["Idempotency-Key"]),
    ["create-key", "update-key", "complete-key", "delete-key"],
  );
  assert.equal(calls[2][2].done, undefined);
  assert.ok(calls[3][0].endsWith("/completion"));
  assert.equal(calls[3][2].done, false);
  assert.ok(calls[4][0].endsWith(`?expectedStateToken=${item.stateToken}`));
  assert.equal(calls[4][2], undefined);
});
