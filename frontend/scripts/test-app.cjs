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
const { applyCommand } = require("../src/domain/commands.ts");
const {
  equalShares,
  calculateSettlement,
  datesBetween,
} = require("../src/domain/models.ts");
const {
  createSeedWorkspace,
  SAMPLE_EMAIL,
} = require("../src/data/fixtures/workspace.ts");
const { MockTravelRepository } = require("../src/data/mock-repository.ts");
const { HttpTravelRepository } = require("../src/data/http-repository.ts");
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
test("파티의 시간 밖 일정과 기존 일정을 제외하는 기간 수정을 차단", () => {
  const agenda = seed().trips[0].agenda[2];
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("agenda", { ...agenda, startTime: "13:00" }),
      ),
    /파티/,
  );
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("agenda", { ...agenda, date: "2026-09-20" }),
      ),
    /파티/,
  );
  assert.throws(
    () => applyCommand(seed(), "jiwoo", update({ startDate: "2026-09-20" })),
    /기존/,
  );
  const party = seed().trips[0].parties[0];
  assert.throws(
    () =>
      applyCommand(
        seed(),
        "jiwoo",
        save("parties", { ...party, endTime: "15:00" }),
      ),
    /일정/,
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
test("송금 당사자만 완료 기록 가능, 지출 변경 시 완료 기록 초기화", () => {
  const t = calculateSettlement(seed().trips[0]).transfers[0];
  const outsider = seed().trips[0].memberIds.find(
    (id) => ![t.from, t.to].includes(id),
  );
  const confirm = {
    type: "transfer.confirm",
    tripId: "busan",
    transferKey: t.key,
  };
  assert.throws(() => applyCommand(seed(), outsider, confirm), /당사자/);
  const confirmed = applyCommand(seed(), t.from, confirm);
  assert.deepEqual(confirmed.trips[0].confirmedTransfers, [t.key]);
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
    /작성자/,
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
test("로컬 저장소 재생성 후 세션과 체크리스트 복원", async () => {
  const storage = new MemoryStorage();
  const first = new MockTravelRepository(storage);
  await first.signIn(SAMPLE_EMAIL);
  await first.execute(
    save("checklist", {
      id: "persist",
      title: "카메라",
      ownerId: null,
      done: true,
    }),
  );
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
        save("checklist", { id, title: id, ownerId: null, done: false }),
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
      ownerId: null,
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
