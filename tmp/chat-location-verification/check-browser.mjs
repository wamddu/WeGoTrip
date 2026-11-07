import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ws = require("../../frontend/node_modules/ws");
const WebSocketServer = ws.WebSocketServer ?? ws.Server;
const dist = path.join(here, "export");
const base = "http://127.0.0.1:41937";
const fakeMap = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#ecf6f1"/><path d="M0 35L320 143M40 200L230 0M0 150L320 32" stroke="#fff" stroke-width="16"/><path d="M160 117s-19-19-19-31a19 19 0 0 1 38 0c0 12-19 31-19 31Z" fill="#1377e8"/><circle cx="160" cy="86" r="6" fill="white"/><text x="10" y="188" font-size="12">Fixture map</text></svg>`;
const profile = (id) => ({ id, name: `테스트 ${id}`, email: `test${id}@example.invalid`, role: "USER", status: "ACTIVE", loginProvider: "LOCAL" });
const pageData = (items = [], extra = {}) => ({ items, nextCursor: null, ...extra });
const records = [];
let previews = 0;
let posts = 0;
let maps = 0;
let failedOnce = false;
const keys = [];
const unknown = new Set();
let sockets;
const broadcast = (record) => {
  for (const socket of sockets.clients) {
    if (socket.readyState === 1 && socket.party === record.party) socket.send(JSON.stringify({ type: "changed", messageId: record.message.id }));
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base);
    const send = (data, status = 200, code = "SUCCESS", message) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ code, message, data }));
    };
    const actor = req.headers["x-test-user"] ?? "1";
    if (url.pathname === "/fixture-map.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
      return res.end(fakeMap);
    }
    if (url.pathname.startsWith("/api/v1/")) {
      const resource = url.pathname.slice(7);
      if (resource === "/auth/tokens/refresh") return send({ accessToken: "test-only-token", userId: actor });
      if (resource === "/users/me") return send(profile(actor));
      if (resource === "/users/me/settings") return send({ pushNotificationEnabled: false, locationSharingEnabled: true });
      if (resource === "/trips") return send(pageData([{ id: "1", title: "채팅 위치 검증", destination: "테스트 여행", startDate: "2026-11-07", endDate: "2026-11-10", budget: 0, owner: { id: "1" }, status: "ACTIVE", version: "0" }]));
      if (resource === "/trips/1/members") return send(pageData([{ user: profile("1") }, { user: profile("2") }]));
      if (resource === "/trips/1/parties") return send(pageData([{ id: "3", name: "테스트 파티", memberIds: ["1", "2"] }]));
      if (resource === "/trips/1/settlement") return send({ settlementRevision: "0", total: 0, balances: {}, transfers: [] });
      if (resource === "/trips/1/expenses") return send(pageData([], { settlementRevision: "0" }));
      if (resource === "/trips/1/packing-items") return send(pageData([], { checklistStateToken: "a".repeat(64) }));
      const party = url.searchParams.get("partyId");
      if (resource === "/trips/1/chat/messages") return send(pageData(url.searchParams.has("imagesOnly") ? [] : records.filter((item) => item.party === party).map((item) => item.message)));
      if (resource === "/trips/1/chat/locations/preview") {
        previews++;
        return send({ url: `${base}/fixture-map.svg` });
      }
      if (resource === "/trips/1/chat/locations") {
        posts++;
        const parts = [];
        for await (const part of req) parts.push(part);
        const location = JSON.parse(Buffer.concat(parts));
        assert.equal(location.latitude, 37.5665);
        assert.equal(location.longitude, 126.978);
        const key = req.headers["idempotency-key"];
        assert.ok(key);
        keys.push(key);
        const old = records.find((item) => item.key === key && item.party === party);
        if (old) return send(old.message, 201);
        const message = { id: String(100 + records.length), kind: "LOCATION", text: "위치를 공유했어요.", authorId: actor, authorName: profile(actor).name, createdAt: new Date().toISOString(), revision: "0", imageUrl: null, poll: null, location: { ...location, revokedAt: null } };
        const record = { party, key, message };
        records.push(record);
        broadcast(record);
        if (!failedOnce) {
          failedOnce = true;
          return send(null, 503, "MOCK_RESPONSE_LOST", "테스트 전송 응답이 유실됐어요.");
        }
        return send(message, 201);
      }
      const match = /^\/trips\/1\/chat\/messages\/(\d+)(?:\/(location-map|location))?$/.exec(resource);
      if (match) {
        const record = records.find((item) => item.party === party && item.message.id === match[1]);
        if (!record) return send(null, 404, "NOT_FOUND");
        if (match[2] === "location-map") {
          maps++;
          return record.message.location.revokedAt ? send(null, 410, "LOCATION_REVOKED") : send({ url: `${base}/fixture-map.svg`, revision: record.message.revision });
        }
        if (match[2] === "location" && req.method === "DELETE") {
          assert.equal(actor, record.message.authorId);
          record.message = { ...record.message, revision: "1", text: "위치 공유가 취소되었어요.", location: { ...record.message.location, latitude: null, longitude: null, accuracyM: null, revokedAt: new Date().toISOString() } };
          broadcast(record);
        }
        return send(record.message);
      }
      if (/^\/(friends|friend-requests|trip-invitations|trips\/1\/(saved-places|itinerary-items|notices))$/.test(resource)) return send(pageData());
      unknown.add(resource);
      return send(pageData());
    }
    const clean = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (path.relative(dist, clean).startsWith("..")) { res.writeHead(404); return res.end(); }
    const file = path.extname(clean) ? clean : path.join(dist, "index.html");
    const type = { ".js": "application/javascript", ".html": "text/html; charset=utf-8", ".png": "image/png", ".css": "text/css", ".woff2": "font/woff2" }[path.extname(file)] ?? "application/octet-stream";
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
sockets = new WebSocketServer({ server, path: "/ws/chat" });
sockets.on("connection", (socket) => socket.on("message", (raw) => {
  const frame = JSON.parse(raw);
  if (frame.type === "subscribe") { socket.party = frame.partyId ?? null; socket.send(JSON.stringify({ type: "ready" })); }
}));
await new Promise((resolve) => server.listen(41937, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const pages = [];
try {
  async function device(actor) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, extraHTTPHeaders: { "X-Test-User": actor } });
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await context.addInitScript(() => {
      window.testFixCalls = 0;
      window.testFixDelay = 0;
      navigator.geolocation.getCurrentPosition = (success) => {
        window.testFixCalls++;
        setTimeout(() => success({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 25 }, timestamp: Date.now() }), window.testFixDelay);
      };
    });
    const page = await context.newPage(); pages.push(page);
    page.on("pageerror", (error) => console.log("PAGE_ERROR", error.message.slice(0, 200)));
    await page.goto(`${base}/trip/1/chat`);
    const later = page.getByRole("button", { name: "나중에", exact: true });
    if (await later.waitFor({ timeout: 5000 }).then(() => true, () => false)) await later.click();
    await page.getByRole("combobox", { name: "채팅방: 전체 채팅" }).click();
    await page.getByRole("option", { name: /테스트 파티/ }).click();
    return page;
  }
  const sender = await device("1");
  const reader = await device("2");
  await sender.bringToFront();
  assert.equal(await sender.evaluate(() => window.testFixCalls), 0);
  const add = () => sender.getByRole("button", { name: "이미지·투표·내 위치 첨부 메뉴 열기" });
  const location = () => sender.getByRole("button", { name: "내 위치", exact: true });
  await sender.evaluate(() => { window.testFixDelay = 650; });
  await add().click(); await location().click();
  await sender.waitForFunction(() => window.testFixCalls === 1);
  await sender.getByRole("button", { name: "취소", exact: true }).click();
  await sender.waitForTimeout(750);
  assert.equal(previews, 0); assert.equal(posts, 0);
  await sender.evaluate(() => { window.testFixDelay = 0; });
  await add().click(); await location().click();
  await sender.getByText("공유 대상 · 테스트 파티", { exact: true }).waitFor();
  await sender.waitForFunction(() => Array.from(document.querySelectorAll("img")).some((img) => img.src.endsWith("/fixture-map.svg") && img.complete && img.naturalWidth > 0));
  assert.equal(previews, 1); assert.equal(posts, 0);
  await sender.getByRole("button", { name: "이 위치 보내기", exact: true }).click();
  await sender.getByText("테스트 전송 응답이 유실됐어요.", { exact: true }).first().waitFor();
  await sender.getByRole("button", { name: "같은 위치 다시 보내기", exact: true }).click();
  await sender.getByText("공유 당시 위치", { exact: true }).waitFor();
  assert.equal(posts, 2); assert.equal(records.length, 1); assert.equal(keys[0], keys[1]); assert.equal(records[0].party, "3");
  await reader.bringToFront();
  await reader.getByText("공유 당시 위치", { exact: true }).waitFor();
  await reader.waitForFunction(() => Array.from(document.querySelectorAll("img")).some((img) => img.src.endsWith("/fixture-map.svg") && img.complete && img.naturalWidth > 0));
  assert.equal(await reader.evaluate(() => window.testFixCalls), 0);
  assert.ok(maps >= 1);
  await reader.getByRole("switch", { name: "이미지 채팅만 보기" }).click();
  await reader.getByText("공유 당시 위치", { exact: true }).waitFor({ state: "detached" });
  await reader.getByRole("switch", { name: "이미지 채팅만 보기" }).click();
  await reader.getByText("공유 당시 위치", { exact: true }).waitFor();
  await sender.bringToFront();
  await sender.getByRole("button", { name: "위치 공유 취소", exact: true }).click();
  await sender.getByRole("button", { name: "공유 취소하기", exact: true }).click();
  await sender.getByText("위치 공유가 취소되었어요.", { exact: true }).waitFor();
  await reader.bringToFront();
  await reader.getByText("위치 공유가 취소되었어요.", { exact: true }).waitFor();
  assert.equal(records[0].message.location.latitude, null);
  assert.equal(await sender.evaluate(() => window.testFixCalls), 2);
  console.log("BROWSER_CHAT_LOCATION_OK", JSON.stringify({ devices: 2, previews, posts, stored: records.length, mapRequests: maps, unexpectedRoutes: [...unknown] }));
} catch (error) {
  console.error(error.message);
  for (const page of pages) console.error((await page.locator("body").innerText().catch(() => "")).slice(0, 1400));
  console.error("UNKNOWN_FIXTURE_ROUTES", [...unknown]);
  process.exitCode = 1;
} finally {
  await browser.close();
  sockets.close();
  server.close();
}
