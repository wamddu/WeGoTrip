import { TripApi, requestKey } from "./trip-api";
import { applyCommand } from "../domain/commands";
import type { Command, Session, Workspace } from "../domain/models";
import type { KeyValueStorage, TravelRepository } from "./contracts";
import { UserApi } from "./user-api";
import type { RefreshStorage } from "./refresh-storage-contract";

/** Server membership and friendships are authoritative. Legacy local data is untouched. */
export class UserTravelRepository implements TravelRepository {
  readonly mode = "http" as const;
  readonly userApi: UserApi;
  readonly tripApi: TripApi;
  private session: Session | null = null;
  private snapshot: Workspace | null = null;
  private pendingCreate: { body: string; key: string } | null = null;
  constructor(
    private baseUrl: string,
    private storage: KeyValueStorage,
    refreshStorage?: RefreshStorage,
  ) {
    this.userApi = new UserApi(baseUrl, refreshStorage);
    this.tripApi = new TripApi(this.userApi);
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
    const [trips, friends] = await Promise.all([
      this.tripApi.trips(),
      this.tripApi.friends(),
    ]);
    const users = new Map([[profile.id, identity.user]]);
    for (const { user } of friends)
      users.set(user.id, { ...user, email: "", color: "#D8ECFF" });
    const mapped: Workspace["trips"] = [];
    for (const t of trips) {
      const members = await this.tripApi.members(t.id);
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
        parties: [],
        places: [],
        agenda: [],
        expenses: [],
        checklist: [],
        notices: [],
        messages: [],
        confirmedTransfers: [],
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
  async execute(command: Command): Promise<Workspace> {
    const session = this.session;
    if (!session) throw new Error("로그인이 필요해요.");
    const current = this.snapshot ?? (await this.load());
    if (this.session !== session) throw new Error("로그인 정보가 변경됐어요.");
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
          drafts[trip.id] = Object.fromEntries(
            localCollections.map((k) => [k, trip[k]]),
          );
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
const localCollections = [
  "parties",
  "places",
  "agenda",
  "expenses",
  "checklist",
  "notices",
  "messages",
  "confirmedTransfers",
] as const;
