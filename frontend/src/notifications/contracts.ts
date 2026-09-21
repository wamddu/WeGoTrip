export type PushPermission = "granted" | "denied" | "undetermined";
export type PushFailure = { stage: "permission" | "token" | "server" | "storage"; code: string; status?: number };
export type PushState =
  | "checking"
  | "unavailable"
  | "offer"
  | "denied"
  | "idle"
  | "registering"
  | "registered"
  | "error";
export interface PushPlatform {
  deviceType: "ANDROID" | "IOS" | "WEB";
  permission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  token(): Promise<string>;
  deleteToken(): Promise<void>;
  subscribe(listener: () => void): () => void;
  openSettings(): Promise<void>;
}
