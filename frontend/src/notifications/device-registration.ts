import type { KeyValueStorage } from "../data/contracts";
import type { UserApi } from "../data/user-api";
import type { PushFailure, PushPlatform, PushState } from "./contracts";

/** One authenticated owner. Serializes token changes and drains before logout. */
export class DeviceRegistration {
  private active = true;
  private queue: Promise<void> = Promise.resolve();
  private deviceId?: string;
  private lastToken?: string;
  private unsubscribe?: () => void;
  private key: string;
  private stage: PushFailure["stage"] = "permission";
  private resolveCancelled!: () => void;
  private cancelled = new Promise<{ cancelled: true }>((resolve) => {
    this.resolveCancelled = () => resolve({ cancelled: true });
  });
  constructor(
    private api: Pick<UserApi, "registerDevice" | "removeDevice">,
    private storage: KeyValueStorage,
    private platform: PushPlatform,
    scope: string,
    userId: string,
    private changed: (state: PushState, failure?: PushFailure) => void,
  ) {
    this.key = `push-device-${encodeURIComponent(scope)}-${userId}`;
  }
  private report(state: PushState) {
    if (this.active) this.changed(state);
  }
  private enqueue(action: () => Promise<void>) {
    const result = this.queue.then(async () => {
      if (this.active) await action();
    });
    this.queue = result.catch((error: unknown) => {
      const value = error as {code?: unknown; status?: unknown; name?: unknown} | null;
      const candidate = value?.code ?? value?.name;
      const code = typeof candidate === "string" && /^[A-Za-z][A-Za-z0-9_/-]{0,79}$/.test(candidate) ? candidate : "PUSH_REGISTRATION_FAILED";
      const status = typeof value?.status === "number" ? value.status : undefined;
      // Show only structured codes, never raw SDK errors containing tokens/URLs.
      if (this.active) this.changed("error", {stage: this.stage, code, status});
    });
    return this.queue;
  }
  start() {
    return this.enqueue(async () => {
      this.stage = "storage";
      this.deviceId = (await this.storage.read(this.key)) ?? undefined;
      if (!this.active) return;
      this.unsubscribe = this.platform.subscribe(() => {
        void this.sync();
      });
      await this.check();
    });
  }
  sync() {
    return this.enqueue(() => this.check());
  }
  private async check() {
    this.stage = "permission";
    const permission = await this.platform.permission();
    if (!this.active) return;
    if (permission === "granted") {
      await this.register();
      return;
    }
    // An OS-level revocation must also stop this device's server registration.
    if (this.deviceId) {
      await this.remove();
      await this.platform.deleteToken();
    }
    if (!this.active) return;
    if (permission === "denied") this.report("denied");
    else
      this.report(
        (await this.storage.read("push-permission-offered-v1"))
          ? "idle"
          : "offer",
      );
  }
  request() {
    if (!this.active) return Promise.resolve();
    // Invoke synchronously from the button press: web permission needs user activation.
    const permission = this.platform.requestPermission().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    this.report("registering");
    return this.enqueue(async () => {
      this.stage = "storage";
      await this.storage.write("push-permission-offered-v1", "1");
      this.stage = "permission";
      const result = await Promise.race([permission, this.cancelled]);
      if ("cancelled" in result) return;
      if ("error" in result) throw result.error;
      if (result.value === "granted") {
        if (this.active) await this.register();
      } else this.report(result.value === "denied" ? "denied" : "idle");
    });
  }
  dismiss() {
    this.report("idle");
    return this.enqueue(() =>
      this.storage.write("push-permission-offered-v1", "1"),
    );
  }
  private async register() {
    this.report("registering");
    this.stage = "token";
    const token = await this.platform.token();
    if (!this.active) return;
    if (!token) throw new Error("No push token");
    if (token === this.lastToken && this.deviceId) {
      this.report("registered");
      return;
    }
    const body = { fcmToken: token, deviceType: this.platform.deviceType };
    this.stage = "server";
    let result;
    try {
      result = await this.api.registerDevice({
        ...body,
        ...(this.deviceId ? { deviceId: this.deviceId } : {}),
      });
    } catch (error) {
      if (!this.active || (error as { status?: number }).status !== 404)
        throw error;
      result = await this.api.registerDevice(body);
    }
    // Save even if logout started during the request, so stop() can remove it.
    this.deviceId = result.id;
    this.stage = "storage";
    await this.storage.write(this.key, result.id);
    this.lastToken = token;
    this.report("registered");
  }
  private async remove() {
    this.stage = "server";
    if (this.deviceId) {
      try {
        await this.api.removeDevice(this.deviceId);
      } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
      }
    }
    this.stage = "storage";
    await this.storage.remove(this.key);
    this.deviceId = undefined;
    this.lastToken = undefined;
  }
  cancel() {
    this.active = false;
    this.resolveCancelled();
    this.unsubscribe?.();
  }
  async stop(authenticated = true) {
    this.cancel();
    await this.queue;
    try {
      if (authenticated) await this.remove();
    } finally {
      await this.platform.deleteToken();
    }
  }
  openSettings() {
    return this.platform.openSettings();
  }
}
