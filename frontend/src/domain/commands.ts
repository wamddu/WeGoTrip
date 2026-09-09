import {
  calculateSettlement,
  datesBetween,
  uid,
  type Command,
  type Trip,
  type TripInput,
  type Workspace,
} from "./models";

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const clock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const amount = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;
const text = (value: string, max = 100) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
function validateTrip(input: Omit<TripInput, "memberIds">) {
  ensure(
    text(input.title) && text(input.destination),
    "여행 이름과 목적지를 입력해 주세요.",
  );
  ensure(
    datesBetween(input.startDate, input.endDate).length,
    "여행 기간은 올바른 날짜로 1~90일 이내여야 해요.",
  );
  ensure(amount(input.budget), "예산은 0~10억원의 정수로 입력해 주세요.");
}

/** Pure command handler shared by the local adapter and contract tests. */
export function applyCommand(
  current: Workspace,
  userId: string,
  command: Command,
): Workspace {
  const next: Workspace = JSON.parse(JSON.stringify(current));
  command = JSON.parse(JSON.stringify(command));
  ensure(
    next.users.some((u) => u.id === userId),
    "다시 로그인해 주세요.",
  );
  const personExists = (id: string) => next.users.some((u) => u.id === id);
  let trip: Trip | undefined;
  let section = "overview";
  let notificationTitle = "여행 정보가 업데이트되었어요";
  if ("tripId" in command) {
    trip = next.trips.find((t) => t.id === command.tripId);
    ensure(
      trip && trip.memberIds.includes(userId),
      "이 여행에 접근할 수 없어요.",
    );
  }
  if (command.type === "trip.create") {
    validateTrip(command.input);
    ensure(
      command.input.memberIds.every(personExists),
      "초대할 멤버를 확인해 주세요.",
    );
    const memberIds = [...new Set([userId, ...command.input.memberIds])];
    next.trips.unshift({
      ...command.input,
      id: uid(),
      ownerId: userId,
      memberIds,
      inviteCode: uid().replace("-", "").slice(-8).toUpperCase(),
      archived: false,
      parties: [],
      places: [],
      agenda: [],
      expenses: [],
      checklist: [],
      notices: [],
      messages: [],
      confirmedTransfers: [],
    });
    trip = next.trips[0];
    notificationTitle = "새 여행에 초대되었어요";
  } else if (command.type === "trip.update" && trip) {
    ensure(trip.ownerId === userId, "여행장만 여행 정보를 수정할 수 있어요.");
    validateTrip(command.input);
    ensure(
      [...trip.agenda, ...trip.parties].every(
        (a) =>
          a.date >= command.input.startDate && a.date <= command.input.endDate,
      ),
      "기존 일정과 파티 활동일을 포함하도록 기간을 설정해 주세요.",
    );
    Object.assign(trip, command.input);
  } else if (command.type === "trip.invite" && trip) {
    ensure(!trip.archived, "종료한 여행은 다시 열어 멤버를 초대해 주세요.");
    ensure(trip.ownerId === userId, "여행장만 멤버를 직접 초대할 수 있어요.");
    ensure(personExists(command.userId), "등록된 사용자를 선택해 주세요.");
    trip.memberIds = [...new Set([...trip.memberIds, command.userId])];
  } else if (command.type === "trip.join") {
    const joined = next.trips.find(
      (t) => t.inviteCode === command.code.trim().toUpperCase(),
    );
    ensure(
      joined && !joined.archived,
      "사용할 수 있는 초대 코드를 확인해 주세요.",
    );
    ensure(!joined.memberIds.includes(userId), "이미 참여 중인 여행이에요.");
    joined.memberIds.push(userId);
    trip = joined;
    notificationTitle = "새 멤버가 여행에 참여했어요";
  } else if (command.type === "friend.add") {
    ensure(
      personExists(command.userId) && command.userId !== userId,
      "친구를 다시 선택해 주세요.",
    );
    next.friendships[userId] = [
      ...new Set([...(next.friendships[userId] ?? []), command.userId]),
    ];
    next.friendships[command.userId] = [
      ...new Set([...(next.friendships[command.userId] ?? []), userId]),
    ];
  } else if (command.type === "notification.read") {
    const notification = next.notifications.find(
      (n) => n.id === command.notificationId && n.userId === userId,
    );
    ensure(notification, "알림을 찾을 수 없어요.");
    notification.read = true;
  } else if (command.type === "transfer.confirm" && trip) {
    const transfer = calculateSettlement(trip).transfers.find(
      (t) => t.key === command.transferKey,
    );
    ensure(
      transfer && (transfer.from === userId || transfer.to === userId),
      "당사자만 송금 완료를 기록할 수 있어요.",
    );
    trip.confirmedTransfers = trip.confirmedTransfers.includes(
      command.transferKey,
    )
      ? trip.confirmedTransfers.filter((key) => key !== command.transferKey)
      : [...trip.confirmedTransfers, command.transferKey];
  } else if (command.type === "item.save" && trip) {
    ensure(
      !trip.archived,
      "종료한 여행은 설정에서 다시 열어 수정할 수 있어요.",
    );
    const { collection, item } = command;
    ensure(text(item.id, 150), "항목 ID가 올바르지 않아요.");
    const isMember = (id: string) => trip!.memberIds.includes(id);
    const isTripDate = (date: string) =>
      datesBetween(trip!.startDate, trip!.endDate).includes(date);
    if (collection === "agenda") {
      const a = command.item;
      ensure(
        text(a.title) && isTripDate(a.date),
        "일정 제목과 여행 기간 내 날짜를 입력해 주세요.",
      );
      ensure(
        clock(a.startTime) && clock(a.endTime) && a.startTime <= a.endTime,
        "시작·종료 시간을 HH:MM 형식으로 확인해 주세요.",
      );
      ensure(
        !a.placeId || trip.places.some((p) => p.id === a.placeId),
        "장소를 다시 선택해 주세요.",
      );
      const party = trip.parties.find((p) => p.id === a.partyId);
      ensure(
        !a.partyId ||
          (party &&
            party.date === a.date &&
            a.startTime >= party.startTime &&
            a.endTime <= party.endTime),
        "파티의 활동 날짜와 시간 안에 일정을 등록해 주세요.",
      );
      section = "schedule";
      notificationTitle = "여행 일정이 업데이트되었어요";
    } else if (collection === "parties") {
      const p = command.item;
      ensure(
        text(p.name) &&
          p.memberIds.length &&
          new Set(p.memberIds).size === p.memberIds.length &&
          p.memberIds.every(isMember),
        "파티 이름과 멤버를 확인해 주세요.",
      );
      ensure(
        isTripDate(p.date) &&
          clock(p.startTime) &&
          clock(p.endTime) &&
          p.startTime < p.endTime,
        "파티 활동 날짜와 시간을 확인해 주세요.",
      );
      ensure(
        trip.agenda
          .filter((a) => a.partyId === p.id)
          .every(
            (a) =>
              a.date === p.date &&
              a.startTime >= p.startTime &&
              a.endTime <= p.endTime,
          ),
        "파티에 등록된 일정의 날짜와 시간을 포함해 주세요.",
      );
    } else if (collection === "places") {
      ensure(
        text(command.item.name) && text(command.item.address, 300),
        "장소 이름과 주소를 입력해 주세요.",
      );
      section = "places";
    } else if (collection === "expenses") {
      const e = command.item;
      ensure(
        text(e.title) &&
          amount(e.amount) &&
          e.amount > 0 &&
          isMember(e.payerId),
        "지출 항목·금액·결제자를 확인해 주세요.",
      );
      ensure(datesBetween(e.date, e.date).length, "지출 날짜를 확인해 주세요.");
      ensure(
        Object.keys(e.shares).length &&
          Object.keys(e.shares).every(isMember) &&
          Object.values(e.shares).every(amount),
        "비용을 나눌 멤버와 부담액을 확인해 주세요.",
      );
      ensure(
        Object.values(e.shares).reduce((sum, value) => sum + value, 0) ===
          e.amount,
        "분담액 합계가 지출 금액과 일치해야 해요.",
      );
      ensure(
        !e.partyId || trip.parties.some((p) => p.id === e.partyId),
        "파티를 다시 선택해 주세요.",
      );
      trip.confirmedTransfers = [];
      section = "expenses";
      notificationTitle = "공동 지출이 업데이트되었어요";
    } else if (collection === "checklist") {
      ensure(
        text(command.item.title) &&
          (!command.item.ownerId || isMember(command.item.ownerId)),
        "준비물 이름과 담당자를 확인해 주세요.",
      );
      section = "checklist";
    } else if (collection === "notices") {
      const n = command.item;
      const previous = trip.notices.find((p) => p.id === n.id);
      ensure(
        !previous || previous.authorId === userId || trip.ownerId === userId,
        "작성자 또는 여행장만 공지를 수정할 수 있어요.",
      );
      ensure(
        text(n.title) && text(n.body, 3000),
        "공지 제목과 내용을 입력해 주세요.",
      );
      n.authorId = previous?.authorId ?? userId;
      n.createdAt = previous?.createdAt ?? new Date().toISOString();
      section = "notices";
      notificationTitle = "새로운 공지를 확인해 주세요";
    } else if (collection === "messages") {
      const m = command.item;
      ensure(
        !trip.messages.some((p) => p.id === m.id) && text(m.text, 2000),
        "메시지는 1~2,000자로 입력해 주세요.",
      );
      m.authorId = userId;
      m.createdAt = new Date().toISOString();
      section = "chat";
      notificationTitle = "새 메시지가 도착했어요";
    }
    // The discriminated union above validates every collection before updating it.
    const list = trip[collection] as { id: string }[];
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index < 0) list.push(item);
    else list[index] = item;
  } else if (command.type === "item.delete" && trip) {
    ensure(!trip.archived, "종료한 여행은 수정할 수 없어요.");
    const { collection, itemId } = command;
    ensure(collection !== "messages", "메시지 삭제는 지원하지 않아요.");
    if (collection === "places")
      ensure(
        !trip.agenda.some((a) => a.placeId === itemId),
        "일정에 연결된 장소예요. 일정의 장소를 먼저 변경해 주세요.",
      );
    if (collection === "parties")
      ensure(
        !trip.agenda.some((a) => a.partyId === itemId) &&
          !trip.expenses.some((e) => e.partyId === itemId),
        "일정 또는 지출에 연결된 파티는 삭제할 수 없어요.",
      );
    if (collection === "notices")
      ensure(
        trip.notices.find((n) => n.id === itemId)?.authorId === userId ||
          trip.ownerId === userId,
        "작성자 또는 여행장만 삭제할 수 있어요.",
      );
    if (collection === "expenses") trip.confirmedTransfers = [];
    const list = trip[collection] as { id: string }[];
    const index = list.findIndex((item) => item.id === itemId);
    ensure(index >= 0, "이미 삭제된 항목이에요.");
    list.splice(index, 1);
    section =
      collection === "agenda"
        ? "schedule"
        : collection === "parties"
          ? "overview"
          : collection;
  }
  if (trip && command.type !== "transfer.confirm") {
    const actor = next.users.find((u) => u.id === userId)!;
    for (const recipient of trip.memberIds.filter((id) => id !== userId)) {
      next.notifications.unshift({
        id: uid(),
        userId: recipient,
        tripId: trip.id,
        title: notificationTitle,
        body: `${actor.name}님 · ${trip.title}`,
        section,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return next;
}
