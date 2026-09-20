export interface RefreshStorage {
  readonly kind: "WEB" | "NATIVE";
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
  canRestore?(): Promise<boolean>;
  exclusive?<T>(action: () => Promise<T>): Promise<T>;
}
