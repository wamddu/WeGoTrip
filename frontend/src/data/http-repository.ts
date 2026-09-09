import type { Command, Session, Workspace } from "../domain/models";
import type { TravelRepository } from "./contracts";

/** Proposed API adapter. Its contract is documented in docs/API-CONTRACT.md. */
export class HttpTravelRepository implements TravelRepository {
  readonly mode = "http" as const;
  private session: Session | null = null;
  constructor(private baseUrl: string) {
    if (!/^https?:\/\//.test(baseUrl))
      throw new Error("EXPO_PUBLIC_API_URL을 설정해 주세요.");
  }
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}${path}`,
        {
          method,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(this.session
              ? { Authorization: `Bearer ${this.session.token}` }
              : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(
          error?.message ||
            (response.status === 401
              ? "로그인이 만료되었어요. 다시 로그인해 주세요."
              : `요청을 처리하지 못했어요 (${response.status}).`),
        );
      }
      return response.status === 204 ? (undefined as T) : await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw new Error("서버 응답이 늦어지고 있어요. 다시 시도해 주세요.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  // Tokens intentionally remain in memory until secure refresh-token storage is implemented.
  async restoreSession() {
    return null;
  }
  async signIn(email: string, password?: string) {
    this.session = await this.request<Session>("/auth/login", "POST", {
      email,
      password,
    });
    return this.session;
  }
  async signUp(name: string, email: string, password?: string) {
    this.session = await this.request<Session>("/auth/register", "POST", {
      name,
      email,
      password,
    });
    return this.session;
  }
  async signOut() {
    try {
      await this.request("/auth/logout", "POST");
    } finally {
      this.session = null;
    }
  }
  load() {
    return this.request<Workspace>("/workspace");
  }
  async execute(command: Command) {
    // The server returns the committed workspace in the same response.
    // Do not automatically retry writes: a timeout can follow a successful commit.
    return this.request<Workspace>("/commands", "POST", {
      commandId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      command,
    });
  }
}
