import { TripApi, requestKey } from "./trip-api";
import { NoticeApi, noticeVersion } from "./notice-api";
import { applyCommand } from "../domain/commands";
import type { Command, Session, Workspace } from "../domain/models";
import type { KeyValueStorage, TravelRepository } from "./contracts";
import { ApiError, UserApi } from "./user-api";
import type { RefreshStorage } from "./refresh-storage-contract";

/** A rejected write can refresh shared data without discarding the editor's inputs. */
export class RepositoryConflictError extends Error {
  constructor(
    message: string,
    public workspace: Workspace,
    public code?: string,
  ) {
    super(message);
  }
}

/** Server membership and friendships are authoritative. Legacy local data is untouched. */
export class UserTravelRepository implements TravelRepository {
  readonly mode = "http" as const;
  readonly userApi: UserApi;
  readonly tripApi: TripApi;
  readonly noticeApi: NoticeApi;
  private session: Session | null = null;
  private snapshot: Workspace | null = null;
  private pendingCreate: { body: string; key: string } | null = null;
  private pendingPartyCreate: { body: string; key: string } | null = null;
  private pendingPlanningCreates = new Map<string, string>();
  private pendingExpenseWrites = new Map<
    string,
    { key: string; startedAt: number }
  >();
  private pendingPackingWrites = new Map<
    string,
    { key: string; startedAt: number; acknowledged: boolean }
  >();
  private pendingNoticeWrites = new Map<
    string,
    { key: string; startedAt: number; acknowledged: boolean }
  >();
  constructor(
    private baseUrl: string,
    private storage: KeyValueStorage,
    refreshStorage?: RefreshStorage,
  ) {
    this.userApi = new UserApi(baseUrl, refreshStorage);
    this.tripApi = new TripApi(this.userApi);
    this.noticeApi = new NoticeApi(this.userApi, this.tripApi);
  }
  async restoreSession() {
    if (!(await this.userApi.restore())) return null;
    return this.loadSession();
  }
  async signIn(email: string, password = "") {
    await this.userApi.login(email, password);
    return this.loadSession();
  }
  private async loadSession() {
    try {
      const profile = await this.userApi.me();
      this.snapshot = null;
      this.pendingCreate = null;
      this.pendingPartyCreate = null;
      this.pendingPlanningCreates.clear();
      this.pendingExpenseWrites.clear();
      this.pendingPackingWrites.clear();
      this.pendingNoticeWrites.clear();
      this.session = {
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          color: "#D8ECFF",
        },
        token: this.userApi.token!,
      };
      return this.session;
    } catch (error) {
      this.userApi.token = null;
      this.session = null;
      this.snapshot = null;
      this.pendingCreate = null;
      this.pendingPartyCreate = null;
      this.pendingPlanningCreates.clear();
      this.pendingExpenseWrites.clear();
      this.pendingPackingWrites.clear();
      this.pendingNoticeWrites.clear();
      throw error;
    }
  }
  async signUp(): Promise<Session> {
    throw new Error("회원가입 후 로그인해 주세요.");
  }
  async signOut() {
    try {
      await this.userApi.logout();
    } finally {
      this.session = null;
      this.snapshot = null;
      this.pendingCreate = null;
      this.pendingPartyCreate = null;
      this.pendingPlanningCreates.clear();
      this.pendingExpenseWrites.clear();
      this.pendingPackingWrites.clear();
      this.pendingNoticeWrites.clear();
    }
  }
  async load(): Promise<Workspace> {
    const profile = await this.userApi.me();
    if (!this.session || this.session.user.id !== profile.id)
      throw new Error("다시 로그인해 주세요.");
    this.session.user = {
      ...this.session.user,
      name: profile.name,
      email: profile.email,
    };
    const identity = this.session;
    const saved = await this.storage.read(this.localKey(identity.user.id));
    const local: Record<string, Partial<Workspace["trips"][number]>> = saved
      ? JSON.parse(saved)
      : {};
    // Keep an additional untouched copy before server-backed reads stop restoring these arrays.
    const legacyExpenses = Object.values(local).some(
      (trip) =>
        (Array.isArray(trip.expenses) && trip.expenses.length > 0) ||
        (Array.isArray(trip.confirmedTransfers) &&
          trip.confirmedTransfers.length > 0),
    );
    if (saved && legacyExpenses) {
      const backupKey = `${this.localKey(identity.user.id)}:expense-backup-v1`;
      if (!(await this.storage.read(backupKey)))
        await this.storage.write(backupKey, saved);
    }
    const legacyChecklist = Object.values(local).some(
      (trip) => Array.isArray(trip.checklist) && trip.checklist.length > 0,
    );
    const checklistBackupKey = `${this.localKey(identity.user.id)}:checklist-backup-v1`;
    let checklistBackup = await this.storage.read(checklistBackupKey);
    if (saved && legacyChecklist && !checklistBackup) {
      await this.storage.write(checklistBackupKey, saved);
      checklistBackup = saved;
    }
    const preservedChecklist: Record<
      string,
      Partial<Workspace["trips"][number]>
    > = checklistBackup ? JSON.parse(checklistBackup) : {};
    const [trips, friends] = await Promise.all([
      this.tripApi.trips(),
      this.tripApi.friends(),
    ]);
    const users = new Map([[profile.id, identity.user]]);
    for (const { user } of friends)
      users.set(user.id, { ...user, email: "", color: "#D8ECFF" });
    const mapped: Workspace["trips"] = [];
    for (const t of trips) {
      const [members, parties, places, agenda, financial, packing, notices] =
        await Promise.all([
          this.tripApi.members(t.id),
          this.tripApi.parties(t.id),
          this.tripApi.savedPlaces(t.id),
          this.tripApi.itineraryItems(t.id),
          this.loadFinancial(t.id),
          this.tripApi.packingItems(t.id),
          this.noticeApi.list(t.id),
        ]);
      for (const { user } of members)
        users.set(
          user.id,
          user.id === profile.id
            ? identity.user
            : { ...user, email: "", color: "#D8ECFF" },
        );
      mapped.push({
        id: t.id,
        title: t.title,
        destination: t.destination,
        startDate: t.startDate,
        endDate: t.endDate,
        budget: t.budget,
        ownerId: t.owner.id,
        memberIds: members.map((m) => m.user.id),
        archived: t.status === "ARCHIVED",
        inviteCode: "",
        serverVersion: t.version,
        parties,
        places,
        agenda,
        expenses: financial.expenses,
        checklist: packing.items,
        notices,
        messages: [],
        settlementRevision: financial.settlement.settlementRevision,
        serverSettlement: financial.settlement,
        confirmedTransfers: financial.settlement.transfers
          .filter((transfer) => transfer.completed)
          .map((transfer) => transfer.key),
        legacyExpensesPreserved:
          !!local[t.id]?.expenses?.length ||
          !!local[t.id]?.confirmedTransfers?.length,
        legacyChecklistPreserved:
          !!local[t.id]?.checklist?.length ||
          !!preservedChecklist[t.id]?.checklist?.length,
        legacyNoticesPreserved: !!local[t.id]?.notices?.length,
      });
      const trip = mapped[mapped.length - 1];
      const draft = local[t.id];
      // Only private planning collections may come from this device; never roles or membership.
      for (const key of localCollections) {
        if (Array.isArray(draft?.[key]))
          Object.assign(trip, { [key]: draft[key] });
      }
    }
    if (this.session !== identity) throw new Error("로그인 정보가 변경됐어요.");
    this.snapshot = {
      version: 1,
      users: [...users.values()],
      trips: mapped,
      friendships: { [profile.id]: friends.map((f) => f.user.id) },
      notifications: [],
    };
    return this.snapshot;
  }
  private localKey(userId: string) {
    return `trip-device-notes-v1:${encodeURIComponent(this.baseUrl.replace(/\/$/, ""))}:${userId}`;
  }
  private async loadFinancial(tripId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const [expenses, settlement] = await Promise.all([
          this.tripApi.expenses(tripId),
          this.tripApi.settlement(tripId),
        ]);
        if (expenses.settlementRevision === settlement.settlementRevision)
          return { expenses: expenses.items, settlement };
      } catch (error) {
        if (!(error instanceof ApiError && error.code === "SETTLEMENT_CHANGED"))
          throw error;
      }
    }
    throw new Error(
      "다른 멤버가 지출을 변경하고 있어요. 잠시 후 다시 불러와 주세요.",
    );
  }
  private async executeFinancial(
    command: Command,
    current: Workspace,
    session: Session,
  ) {
    if (!("tripId" in command)) throw new Error("여행 정보를 확인해 주세요.");
    const trip = current.trips.find((item) => item.id === command.tripId);
    if (
      !trip ||
      !trip.memberIds.includes(session.user.id) ||
      trip.settlementRevision === undefined
    )
      throw new Error("지출 정보를 다시 불러와 주세요.");
    let operation: string;
    let input: unknown;
    let target = "";
    let perform: (key: string) => Promise<unknown>;
    if (command.type === "transfer.confirm") {
      const parts = command.transferKey.split(":");
      if (
        parts.length !== 4 ||
        parts.some((part) => !/^(0|[1-9][0-9]*)$/.test(part))
      )
        throw new Error("정산 정보를 다시 불러와 주세요.");
      const [keyRevision, fromUserId, toUserId, amountText] = parts;
      const amount = Number(amountText);
      if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        toUserId !== session.user.id ||
        typeof command.completed !== "boolean" ||
        command.confirmationVersion === undefined
      )
        throw new Error(
          "송금을 받는 사람만 현재 정산의 완료 상태를 변경할 수 있어요.",
        );
      operation = "confirmation";
      input = {
        settlementRevision: command.settlementRevision ?? keyRevision,
        fromUserId,
        toUserId,
        amount,
        completed: command.completed,
        confirmationVersion: command.confirmationVersion,
      };
      perform = (key) =>
        this.tripApi.confirmTransfer(
          command.tripId,
          input as Parameters<TripApi["confirmTransfer"]>[1],
          key,
        );
    } else if (
      command.type === "item.delete" &&
      command.collection === "expenses"
    ) {
      operation = "delete";
      target = command.itemId;
      const expectedRevision =
        command.settlementRevision ?? trip.settlementRevision;
      input = { settlementRevision: expectedRevision };
      perform = (key) =>
        this.tripApi.removeExpense(
          command.tripId,
          target,
          expectedRevision,
          key,
        );
    } else if (
      command.type === "item.save" &&
      command.collection === "expenses"
    ) {
      const { id, ...expense } = command.item;
      const body = {
        ...expense,
        title: expense.title.trim(),
        shares: Object.fromEntries(
          Object.entries(expense.shares).sort(([a], [b]) => a.localeCompare(b)),
        ),
      };
      if (/^[1-9][0-9]*$/.test(id)) {
        operation = "update";
        target = id;
        const update = {
          ...body,
          settlementRevision:
            command.settlementRevision ?? trip.settlementRevision,
        };
        input = update;
        perform = (key) =>
          this.tripApi.updateExpense(command.tripId, target, update, key);
      } else {
        operation = "create";
        input = body;
        perform = (key) =>
          this.tripApi.createExpense(command.tripId, body, key);
      }
    } else throw new Error("지출 요청을 확인해 주세요.");
    const serialized = JSON.stringify([
      operation,
      command.tripId,
      target,
      input,
    ]);
    const pending = this.pendingExpenseWrites.get(serialized);
    if (pending && Date.now() - pending.startedAt >= 24 * 60 * 60 * 1000) {
      throw new Error(
        "저장 확인 시간이 지났어요. 최신 지출 목록을 확인한 뒤 다시 입력해 주세요.",
      );
    }
    // A retry may already have succeeded: replay before checking changed references or archive status.
    if (!pending && command.type !== "transfer.confirm")
      applyCommand(current, session.user.id, command);
    const request = pending ?? { key: requestKey(), startedAt: Date.now() };
    this.pendingExpenseWrites.set(serialized, request);
    try {
      await perform(request.key);
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      const next = await this.load();
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      this.pendingExpenseWrites.delete(serialized);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        this.pendingExpenseWrites.delete(serialized);
        const latest = await this.load().catch(() => null);
        if (latest && this.session === session)
          throw new RepositoryConflictError(
            `${error.message} 최신 내용을 확인한 뒤 다시 선택해 주세요.`,
            latest,
          );
      }
      throw error;
    }
  }
  private async executePacking(
    command: Command,
    current: Workspace,
    session: Session,
  ) {
    if (!("tripId" in command)) throw new Error("여행 정보를 확인해 주세요.");
    const trip = current.trips.find((item) => item.id === command.tripId);
    if (!trip || !trip.memberIds.includes(session.user.id))
      throw new Error("준비물 정보를 다시 불러와 주세요.");
    let operation: string;
    let input: unknown;
    let target = "";
    let expectedStateToken: string | undefined;
    let perform: (key: string) => Promise<unknown>;
    if (command.type === "checklist.complete") {
      const item = trip.checklist.find((entry) => entry.id === command.itemId);
      if (item?.ownerId === null)
        throw new ApiError(
          409,
          "PACKING_ASSIGNMENT_REQUIRED",
          "담당자가 없는 준비물은 먼저 담당자를 지정해 주세요.",
        );
      if (item && item.ownerId !== null && item.ownerId !== session.user.id)
        throw new ApiError(
          403,
          "PACKING_OWNER_REQUIRED",
          "배정된 준비물은 담당자만 완료 상태를 변경할 수 있어요.",
        );
      operation = "complete";
      target = command.itemId;
      expectedStateToken = command.expectedStateToken;
      input = { done: command.done, expectedStateToken };
      perform = (key) =>
        this.tripApi.completePackingItem(
          command.tripId,
          target,
          input as Parameters<TripApi["completePackingItem"]>[2],
          key,
        );
    } else if (
      command.type === "item.delete" &&
      command.collection === "checklist"
    ) {
      operation = "delete";
      target = command.itemId;
      expectedStateToken = command.expectedStateToken;
      input = { expectedStateToken };
      perform = (key) =>
        this.tripApi.removePackingItem(
          command.tripId,
          target,
          expectedStateToken!,
          key,
        );
    } else if (
      command.type === "item.save" &&
      command.collection === "checklist"
    ) {
      const body = {
        title: command.item.title.trim(),
        ownerId: command.item.ownerId,
      };
      if (
        /^[1-9][0-9]*$/.test(command.item.id) ||
        command.item.stateToken !== undefined
      ) {
        operation = "update";
        target = command.item.id;
        expectedStateToken = command.item.stateToken;
        input = { ...body, expectedStateToken };
        perform = (key) =>
          this.tripApi.updatePackingItem(
            command.tripId,
            target,
            input as Parameters<TripApi["updatePackingItem"]>[2],
            key,
          );
      } else {
        operation = "create";
        input = body;
        perform = (key) =>
          this.tripApi.createPackingItem(command.tripId, body, key);
      }
    } else throw new Error("준비물 요청을 확인해 주세요.");
    if (
      operation !== "create" &&
      (!/^[1-9][0-9]*$/.test(target) ||
        typeof expectedStateToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(expectedStateToken))
    )
      throw new Error("준비물 정보를 다시 불러온 뒤 변경해 주세요.");
    const serialized = JSON.stringify([
      operation,
      command.tripId,
      target,
      input,
    ]);
    const pending = this.pendingPackingWrites.get(serialized);
    if (
      pending &&
      !pending.acknowledged &&
      Date.now() - pending.startedAt >= 24 * 60 * 60 * 1000
    ) {
      // Do not replay an expired key. A verified fresh list lets the user begin a new intent.
      const latest = await this.load();
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      this.pendingPackingWrites.delete(serialized);
      throw new RepositoryConflictError(
        "저장 확인 시간이 지났어요. 최신 준비물 목록에서 변경 여부를 확인한 뒤 새로 입력해 주세요.",
        latest,
        "PACKING_RETRY_EXPIRED",
      );
    }
    // Preserve the original expected state and key: a response-lost write may already be committed.
    if (!pending) applyCommand(current, session.user.id, command);
    const request = pending ?? {
      key: requestKey(),
      startedAt: Date.now(),
      acknowledged: false,
    };
    this.pendingPackingWrites.set(serialized, request);
    try {
      if (!request.acknowledged) {
        await perform(request.key);
        request.acknowledged = true;
      }
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      const next = await this.load();
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      this.pendingPackingWrites.delete(serialized);
      return next;
    } catch (error) {
      if (
        !request.acknowledged &&
        error instanceof ApiError &&
        (error.status === 409 ||
          error.code === "PACKING_ITEM_NOT_FOUND" ||
          error.code === "PACKING_OWNER_REQUIRED")
      ) {
        this.pendingPackingWrites.delete(serialized);
        const latest = await this.load().catch(() => null);
        if (latest && this.session === session)
          throw new RepositoryConflictError(
            `${error.message} 최신 내용을 확인한 뒤 다시 저장해 주세요.`,
            latest,
          );
      } else if (
        !request.acknowledged &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        this.pendingPackingWrites.delete(serialized);
      }
      throw error;
    }
  }
  private async executeNotices(
    command: Extract<Command, { type: "item.save" | "item.delete" }>,
    current: Workspace,
    session: Session,
  ) {
    const trip = current.trips.find((entry) => entry.id === command.tripId);
    if (!trip || trip.ownerId !== session.user.id)
      throw new ApiError(
        403,
        "TRIP_OWNER_REQUIRED",
        "여행장만 공지를 관리할 수 있어요.",
      );
    if (command.collection !== "notices")
      throw new Error("공지 요청을 확인해 주세요.");
    let operation: string,
      target: string,
      input: unknown,
      perform: (key: string) => Promise<unknown>;
    if (command.type === "item.delete") {
      if (!noticeVersion(command.expectedVersion))
        throw new Error("최신 공지를 다시 불러와 주세요.");
      operation = "delete";
      target = command.itemId;
      input = { expectedVersion: command.expectedVersion };
      perform = (key) =>
        this.noticeApi.remove(
          command.tripId,
          target,
          command.expectedVersion!,
          key,
        );
    } else {
      const notice = command.item;
      const body = {
        title: notice.title.trim(),
        body: notice.body.trim(),
        pinned: notice.pinned,
      };
      target = notice.id;
      if (/^[1-9]\d*$/.test(target) || notice.version !== undefined) {
        if (!noticeVersion(notice.version))
          throw new Error("최신 공지를 다시 불러와 주세요.");
        operation = "update";
        input = { ...body, expectedVersion: notice.version };
        perform = (key) =>
          this.noticeApi.update(
            command.tripId,
            target,
            { ...body, expectedVersion: notice.version! },
            key,
          );
      } else {
        operation = "create";
        input = body;
        perform = (key) => this.noticeApi.create(command.tripId, body, key);
      }
    }
    if (operation !== "create" && !/^[1-9]\d*$/.test(target))
      throw new Error("최신 공지를 다시 불러와 주세요.");
    const serialized = JSON.stringify([
      operation,
      command.tripId,
      target,
      input,
    ]);
    const pending = this.pendingNoticeWrites.get(serialized);
    if (
      pending &&
      !pending.acknowledged &&
      Date.now() - pending.startedAt >= 24 * 60 * 60 * 1000
    ) {
      const latest = await this.load();
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      this.pendingNoticeWrites.delete(serialized);
      throw new RepositoryConflictError(
        "저장 확인 시간이 지났어요. 공지 목록에서 결과를 확인한 뒤 다시 열어 주세요.",
        latest,
        "NOTICE_RETRY_EXPIRED",
      );
    }
    if (!pending) applyCommand(current, session.user.id, command);
    const request = pending ?? {
      key: requestKey(),
      startedAt: Date.now(),
      acknowledged: false,
    };
    this.pendingNoticeWrites.set(serialized, request);
    try {
      if (!request.acknowledged) {
        await perform(request.key);
        request.acknowledged = true;
      }
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      const next = await this.load();
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      this.pendingNoticeWrites.delete(serialized);
      return next;
    } catch (error) {
      if (
        !request.acknowledged &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        this.pendingNoticeWrites.delete(serialized);
        const latest = await this.load().catch(() => null);
        if (latest && this.session === session)
          throw new RepositoryConflictError(error.message, latest, error.code);
      }
      throw error;
    }
  }
  async execute(command: Command): Promise<Workspace> {
    const session = this.session;
    if (!session) throw new Error("로그인이 필요해요.");
    const current = this.snapshot ?? (await this.load());
    if (this.session !== session) throw new Error("로그인 정보가 변경됐어요.");
    if (
      (command.type === "item.save" || command.type === "item.delete") &&
      command.collection === "notices"
    )
      return this.executeNotices(command, current, session);
    if (
      command.type === "checklist.complete" ||
      ((command.type === "item.save" || command.type === "item.delete") &&
        command.collection === "checklist")
    )
      return this.executePacking(command, current, session);
    if (
      command.type === "transfer.confirm" ||
      ((command.type === "item.save" || command.type === "item.delete") &&
        command.collection === "expenses")
    )
      return this.executeFinancial(command, current, session);
    if (
      (command.type === "item.save" || command.type === "item.delete") &&
      (command.collection === "places" || command.collection === "agenda")
    ) {
      let pendingBody: string | undefined;
      if (command.type === "item.delete") {
        applyCommand(current, session.user.id, command);
        if (command.collection === "places")
          await this.tripApi.removeSavedPlace(command.tripId, command.itemId);
        else
          await this.tripApi.removeItineraryItem(
            command.tripId,
            command.itemId,
          );
      } else if (command.collection === "places") {
        // Google search IDs remain in the original device drafts, not the shared schema.
        const input = {
          name: command.item.name.trim(),
          address: command.item.address.trim(),
          category: command.item.category.trim(),
          note: command.item.note,
          coordinates: command.item.coordinates
            ? {
                latitude: command.item.coordinates.latitude,
                longitude: command.item.coordinates.longitude,
              }
            : null,
        };
        if (/^[1-9][0-9]*$/.test(command.item.id)) {
          applyCommand(current, session.user.id, command);
          await this.tripApi.updateSavedPlace(
            command.tripId,
            command.item.id,
            input,
          );
        } else {
          pendingBody = JSON.stringify(["places", command.tripId, input]);
          const previousKey = this.pendingPlanningCreates.get(pendingBody);
          // A known retry may already be committed; the server authenticates and replays it
          // before checking whether the trip or references have changed since creation.
          if (!previousKey) applyCommand(current, session.user.id, command);
          const key = previousKey ?? requestKey();
          this.pendingPlanningCreates.set(pendingBody, key);
          await this.tripApi.createSavedPlace(command.tripId, input, key);
        }
      } else {
        const input = {
          title: command.item.title.trim(),
          date: command.item.date,
          startTime: command.item.startTime,
          endTime: command.item.endTime,
          placeId: command.item.placeId,
          partyId: command.item.partyId,
          note: command.item.note,
        };
        if (/^[1-9][0-9]*$/.test(command.item.id)) {
          applyCommand(current, session.user.id, command);
          await this.tripApi.updateItineraryItem(
            command.tripId,
            command.item.id,
            input,
          );
        } else {
          pendingBody = JSON.stringify(["agenda", command.tripId, input]);
          const previousKey = this.pendingPlanningCreates.get(pendingBody);
          if (!previousKey) applyCommand(current, session.user.id, command);
          const key = previousKey ?? requestKey();
          this.pendingPlanningCreates.set(pendingBody, key);
          await this.tripApi.createItineraryItem(command.tripId, input, key);
        }
      }
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      const next = await this.load();
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      // A failed write response or reload retains the key even if the editor changes its temporary ID.
      if (pendingBody) this.pendingPlanningCreates.delete(pendingBody);
      return next;
    }
    if (
      (command.type === "item.save" || command.type === "item.delete") &&
      command.collection === "parties"
    ) {
      // Keep the existing editor, but use server IDs and server-owned subgroup membership.
      applyCommand(current, session.user.id, command);
      if (command.type === "item.delete") {
        await this.tripApi.removeParty(command.tripId, command.itemId);
      } else {
        const input = {
          name: command.item.name.trim(),
          memberIds: [...command.item.memberIds].sort(),
        };
        if (/^[1-9][0-9]*$/.test(command.item.id)) {
          await this.tripApi.updateParty(
            command.tripId,
            command.item.id,
            input,
          );
        } else {
          const body = JSON.stringify([command.tripId, input]);
          if (this.pendingPartyCreate?.body !== body)
            this.pendingPartyCreate = { body, key: requestKey() };
          await this.tripApi.createParty(
            command.tripId,
            input,
            this.pendingPartyCreate.key,
          );
        }
      }
      if (this.session !== session)
        throw new Error("로그인 정보가 변경됐어요.");
      const next = await this.load();
      this.pendingPartyCreate = null;
      return next;
    }
    let selectedId: string | undefined;
    switch (command.type) {
      case "trip.create": {
        const { memberIds, ...input } = command.input;
        const body = { ...input, inviteeIds: [...memberIds].sort() };
        const serialized = JSON.stringify(body);
        if (this.pendingCreate?.body !== serialized)
          this.pendingCreate = { body: serialized, key: requestKey() };
        selectedId = (await this.tripApi.create(body, this.pendingCreate.key))
          .trip.id;
        break;
      }
      case "trip.join":
        selectedId = (await this.tripApi.join(command.code)).tripId;
        break;
      case "trip.invite":
        await this.tripApi.invite(command.tripId, command.userId);
        break;
      case "friend.add":
        await this.tripApi.requestFriend(command.userId);
        break;
      case "trip.update": {
        const trip = current.trips.find((t) => t.id === command.tripId);
        if (!trip || trip.serverVersion === undefined)
          throw new Error("여행 정보를 다시 불러와 주세요.");
        applyCommand(current, session.user.id, command);
        const { archived, ...fields } = command.input;
        if (trip.archived && archived)
          throw new Error("보관된 여행은 먼저 진행 중으로 변경해 주세요.");
        if (
          trip.archived &&
          Object.entries(fields).some(
            ([key, value]) => trip[key as keyof typeof trip] !== value,
          )
        )
          throw new Error("먼저 여행을 재개한 뒤 정보를 수정해 주세요.");
        await this.tripApi.update(
          trip.id,
          trip.archived
            ? {
                version: command.version ?? trip.serverVersion,
                status: "ACTIVE",
              }
            : {
                ...fields,
                version: command.version ?? trip.serverVersion,
                status: archived ? "ARCHIVED" : "ACTIVE",
              },
        );
        break;
      }
      default: {
        // Existing planning screens remain device-local until their own APIs are added.
        const fresh = await this.load();
        if (this.session !== session)
          throw new Error("로그인 정보가 변경됐어요.");
        const next = applyCommand(fresh, session.user.id, command);
        const key = this.localKey(session.user.id);
        const raw = await this.storage.read(key);
        const drafts = raw ? JSON.parse(raw) : {};
        if ("tripId" in command) {
          const trip = next.trips.find((t) => t.id === command.tripId)!;
          drafts[trip.id] = {
            ...drafts[trip.id],
            ...Object.fromEntries(localCollections.map((k) => [k, trip[k]])),
          };
          await this.storage.write(key, JSON.stringify(drafts));
        }
        // Local changes must not create invitations or notices for other accounts.
        next.notifications = [];
        if (this.session !== session)
          throw new Error("로그인 정보가 변경됐어요.");
        this.snapshot = next;
        return next;
      }
    }
    if (this.session !== session) throw new Error("로그인 정보가 변경됐어요.");
    const next = await this.load();
    if (selectedId)
      next.trips.sort((a, b) =>
        a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0,
      );
    if (command.type === "trip.create") this.pendingCreate = null;
    return next;
  }
}
const localCollections = ["messages"] as const;
