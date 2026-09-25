export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  loginProvider: string;
  bankAccountNumberMasked: string | null;
  bankAccountNumber: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface UserSettings {
  pushNotificationEnabled: boolean;
  locationSharingEnabled: boolean;
}
export interface Consent {
  id: string;
  consentType: string;
  version: string;
  agreedAt: string;
}
export interface Registration {
  name: string;
  email: string;
  password: string;
  consents: { consentType: string; version: string }[];
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
/** Access tokens stay in memory. Refresh storage is injected per platform. */
export class UserApi {
  token: string | null = null;
  onExpired?: () => void;
  private refreshing: Promise<void> | null = null;
  private generation = 0;
  private userId: string | null = null;
  constructor(
    private baseUrl: string,
    private refreshStorage?: import("./refresh-storage-contract").RefreshStorage,
  ) {
    if (!/^https?:\/\//.test(baseUrl))
      throw new Error("API 서버 주소를 설정해 주세요.");
  }
  private async send<T>(
    path: string,
    method: string,
    body: unknown,
    token: string | null,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/v1${path}`,
        {
          method,
          signal: controller.signal,
          credentials: this.refreshStorage?.kind === "WEB" ? "include" : "omit",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const envelope = await response.json().catch(() => null);
      if (!response.ok)
        throw new ApiError(
          response.status,
          envelope?.code ?? "HTTP_ERROR",
          envelope?.message ?? "요청을 처리하지 못했어요.",
        );
      if (envelope?.code !== "SUCCESS" || !("data" in envelope))
        throw new Error("서버 응답 형식이 올바르지 않아요.");
      return envelope.data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw new Error("서버 응답이 늦어지고 있어요. 다시 로그인해 주세요.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  private async expire(notify = true) {
    this.token = null;
    this.userId = null;
    try {
      await this.refreshStorage?.clear();
    } finally {
      if (notify) this.onExpired?.();
    }
  }
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const epoch = this.generation;
    const sentToken =
      path.startsWith("/auth/") || path === "/users" ? null : this.token;
    try {
      const result = await this.send<T>(path, method, body, sentToken, headers);
      if (sentToken && epoch !== this.generation)
        throw new ApiError(401, "SESSION_CHANGED", "로그인 정보가 변경됐어요.");
      return result;
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        !sentToken ||
        epoch !== this.generation
      )
        throw error;
      if (error.status === 401 && this.refreshStorage) {
        if (this.token === sentToken) await this.refresh();
        if (epoch !== this.generation || !this.token) throw error;
        // Only retry an explicit 401 once, never a timed-out or failed write.
        try {
          const result = await this.send<T>(
            path,
            method,
            body,
            this.token,
            headers,
          );
          if (epoch !== this.generation)
            throw new ApiError(
              401,
              "SESSION_CHANGED",
              "로그인 정보가 변경됐어요.",
            );
          return result;
        } catch (retryError) {
          if (
            epoch === this.generation &&
            retryError instanceof ApiError &&
            (retryError.status === 401 ||
              retryError.code === "ACCOUNT_UNAVAILABLE")
          )
            await this.expire();
          throw retryError;
        }
      }
      if (
        (error.status === 401 || error.code === "ACCOUNT_UNAVAILABLE") &&
        this.token === sentToken
      )
        await this.expire();
      throw error;
    }
  }
  private async accept(result: {
    accessToken: string;
    refreshToken?: string;
    userId?: string;
  }) {
    if (typeof result.accessToken !== "string")
      throw new Error("로그인 응답이 올바르지 않아요.");
    if (this.refreshStorage) {
      if (
        this.refreshStorage.kind === "NATIVE" &&
        typeof result.refreshToken !== "string"
      )
        throw new Error("재발급 토큰을 받지 못했어요.");
      await this.refreshStorage.write(result.refreshToken ?? "");
    }
    this.token = result.accessToken;
    this.userId = result.userId ?? null;
  }
  async refresh(notify = true): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const store = this.refreshStorage;
    if (!store)
      throw new ApiError(401, "INVALID_REFRESH_TOKEN", "다시 로그인해 주세요.");
    const epoch = this.generation;
    const rotate = async () => {
      if (epoch !== this.generation) return;
      if (store.canRestore && !(await store.canRestore()))
        throw new ApiError(
          401,
          "INVALID_REFRESH_TOKEN",
          "다시 로그인해 주세요.",
        );
      const raw = await store.read();
      if (store.kind === "NATIVE" && !raw)
        throw new ApiError(
          401,
          "INVALID_REFRESH_TOKEN",
          "다시 로그인해 주세요.",
        );
      const result = await this.send<{
        accessToken: string;
        refreshToken?: string;
        userId?: string;
      }>(
        "/auth/tokens/refresh",
        "POST",
        {
          clientType: store.kind,
          ...(store.kind === "NATIVE" ? { refreshToken: raw } : {}),
        },
        null,
      );
      if (this.userId && result.userId !== this.userId) {
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "다른 창에서 로그인 계정이 변경됐어요. 다시 로그인해 주세요.",
        );
      }
      // Save the rotated credential even if logout started; logout waits for this
      // promise, then revokes and clears the newest credential.
      await this.accept(result);
      if (epoch !== this.generation) this.token = null;
    };
    const operation = (
      store.exclusive ? store.exclusive(rotate) : rotate()
    ).catch(async (error) => {
      await this.expire(notify); // An ambiguous rotation must not resend a potentially consumed token.
      throw error;
    });
    this.refreshing = operation;
    try {
      await operation;
    } finally {
      if (this.refreshing === operation) this.refreshing = null;
    }
  }
  async restore(): Promise<boolean> {
    if (!this.refreshStorage) return false;
    if (
      this.refreshStorage.canRestore &&
      !(await this.refreshStorage.canRestore())
    )
      return false;
    if (
      this.refreshStorage.kind === "NATIVE" &&
      !(await this.refreshStorage.read())
    )
      return false;
    try {
      await this.refresh(false);
      return this.token !== null;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false;
      throw error;
    }
  }
  register(body: Registration) {
    return this.request<{ id: string }>("/users", "POST", body);
  }
  async login(email: string, password: string) {
    await this.refreshing?.catch(() => undefined);
    const result = await this.send<{
      accessToken: string;
      refreshToken?: string;
      userId?: string;
    }>(
      "/auth/login",
      "POST",
      {
        email,
        password,
        clientType: this.refreshStorage?.kind ?? "NATIVE",
      },
      null,
    );
    this.generation++;
    try {
      await this.accept(result);
    } catch (error) {
      await this.expire();
      throw error;
    }
  }
  async logout() {
    this.generation++;
    await this.refreshing?.catch(() => undefined);
    try {
      if (this.refreshStorage) {
        const raw = await this.refreshStorage.read();
        await this.send(
          "/auth/logout",
          "POST",
          {
            clientType: this.refreshStorage.kind,
            ...(raw ? { refreshToken: raw } : {}),
          },
          null,
        );
      } else if (this.token)
        await this.send("/auth/logout", "POST", undefined, this.token);
    } finally {
      await this.expire(false);
    }
  }
  me() {
    return this.request<UserProfile>("/users/me");
  }
  updateProfile(body: { name?: string; bankAccountNumber?: string | null }) {
    return this.request<UserProfile>("/users/me", "PATCH", body);
  }
  settings() {
    return this.request<UserSettings>("/users/me/settings");
  }
  updateSettings(body: Partial<UserSettings>) {
    return this.request<UserSettings>("/users/me/settings", "PATCH", body);
  }
  async consents() {
    const result = await this.request<{ consents: Consent[] }>(
      "/users/me/consents",
    );
    return result.consents;
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.request<null>("/users/me/password", "PUT", {
      currentPassword,
      newPassword,
    });
  }
  withdraw() {
    return this.request<null>("/users/me", "DELETE");
  }
  registerDevice(body: {
    deviceId?: string;
    fcmToken: string;
    deviceType: "ANDROID" | "IOS" | "WEB";
  }) {
    return this.request<{ id: string }>("/users/me/devices", "POST", body);
  }
  removeDevice(id: string) {
    return this.request<null>(
      `/users/me/devices/${encodeURIComponent(id)}`,
      "DELETE",
    );
  }
}
