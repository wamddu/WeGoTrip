import { applyCommand } from "../domain/commands";
import {
  uid,
  type Command,
  type Session,
  type Workspace,
} from "../domain/models";
import type { KeyValueStorage, TravelRepository } from "./contracts";
import { createSeedWorkspace, SAMPLE_EMAIL } from "./fixtures/workspace";
import { addSeedCoordinates } from "./migrations";

const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export class MockTravelRepository implements TravelRepository {
  readonly mode = "mock" as const;
  readonly sampleEmail = SAMPLE_EMAIL;
  private session: Session | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}
  private async readDatabase(): Promise<Workspace> {
    const saved = await this.storage.read("workspace-v1");
    if (saved) {
      const data = JSON.parse(saved) as Workspace;
      if (
        data.version !== 1 ||
        !Array.isArray(data.users) ||
        !Array.isArray(data.trips)
      )
        throw new Error(
          "저장된 데이터 버전을 읽을 수 없어요. 데이터를 보존한 채 다시 시도해 주세요.",
        );
      return addSeedCoordinates(data);
    }
    const data = createSeedWorkspace();
    await this.storage.write("workspace-v1", JSON.stringify(data));
    return data;
  }
  private transaction<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  async restoreSession() {
    const raw = await this.storage.read("local-session");
    if (!raw) return null;
    const data = await this.readDatabase();
    const user = data.users.find((u) => u.id === JSON.parse(raw).userId);
    this.session = user ? { user, token: "local-profile" } : null;
    return this.session;
  }
  async signIn(email: string) {
    return this.transaction(async () => {
      const data = await this.readDatabase();
      const user = data.users.find(
        (u) => u.email === email.trim().toLowerCase(),
      );
      if (!user)
        throw new Error("등록된 이메일이 없어요. 먼저 프로필을 만들어 주세요.");
      await this.storage.write(
        "local-session",
        JSON.stringify({ userId: user.id }),
      );
      this.session = { user, token: "local-profile" };
      return this.session;
    });
  }
  async signUp(name: string, email: string) {
    return this.transaction(async () => {
      const data = await this.readDatabase();
      const normalized = email.trim().toLowerCase();
      if (!name.trim() || name.trim().length > 30 || !emailValid(normalized))
        throw new Error("이름과 올바른 이메일을 입력해 주세요.");
      if (data.users.some((u) => u.email === normalized))
        throw new Error("이미 등록된 이메일이에요. 로그인해 주세요.");
      const user = {
        id: uid(),
        name: name.trim(),
        email: normalized,
        color: "#D8ECFF",
      };
      data.users.push(user);
      data.friendships[user.id] = [];
      await this.storage.write("workspace-v1", JSON.stringify(data));
      await this.storage.write(
        "local-session",
        JSON.stringify({ userId: user.id }),
      );
      this.session = { user, token: "local-profile" };
      return this.session;
    });
  }
  async signOut() {
    await this.queue;
    await this.storage.remove("local-session");
    this.session = null;
  }
  private visible(data: Workspace): Workspace {
    if (!this.session) throw new Error("로그인이 필요해요.");
    const id = this.session.user.id;
    return {
      ...data,
      trips: data.trips.filter((t) => t.memberIds.includes(id)),
      notifications: data.notifications.filter((n) => n.userId === id),
    };
  }
  async load() {
    await this.queue;
    return this.visible(await this.readDatabase());
  }
  async execute(command: Command) {
    return this.transaction(async () => {
      if (!this.session) throw new Error("로그인이 필요해요.");
      const next = applyCommand(
        await this.readDatabase(),
        this.session.user.id,
        command,
      );
      await this.storage.write("workspace-v1", JSON.stringify(next));
      return this.visible(next);
    });
  }
}
