import { applyCommand } from "../domain/commands";
import type { Command, Session, Workspace } from "../domain/models";
import type { KeyValueStorage, TravelRepository } from "./contracts";
import { UserApi } from "./user-api";
import type { RefreshStorage } from "./refresh-storage-contract";

/** Server accounts with separate, per-account local travel data until trip APIs exist. */
export class UserTravelRepository implements TravelRepository {
  readonly mode = "http" as const;
  readonly userApi: UserApi;
  private session: Session | null = null;
  constructor(
    baseUrl: string,
    private storage: KeyValueStorage,
    refreshStorage?: RefreshStorage,
  ) {
    this.userApi = new UserApi(baseUrl, refreshStorage);
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
    }
  }
  private key() {
    if (!this.session) throw new Error("로그인이 필요해요.");
    return `server-user-${this.session.user.id}-workspace-v1`;
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
    const saved = await this.storage.read(this.key());
    const data: Workspace = saved
      ? JSON.parse(saved)
      : {
          version: 1,
          users: [],
          trips: [],
          friendships: {},
          notifications: [],
        };
    if (
      data.version !== 1 ||
      !Array.isArray(data.trips) ||
      !Array.isArray(data.users)
    )
      throw new Error("저장된 여행 데이터를 읽지 못했어요.");
    data.users = [
      ...data.users.filter((u) => u.id !== profile.id),
      this.session.user,
    ];
    return data;
  }
  async execute(command: Command) {
    const data = await this.load();
    const next = applyCommand(data, this.session!.user.id, command);
    await this.storage.write(this.key(), JSON.stringify(next));
    return next;
  }
}
