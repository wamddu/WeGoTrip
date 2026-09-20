import * as SecureStore from "expo-secure-store";
import type { RefreshStorage } from "./refresh-storage-contract";

export function createRefreshStorage(baseUrl: string): RefreshStorage {
  // SecureStore keys allow alphanumerics, dots, underscores and hyphens.
  const key = `wego.refresh.${Array.from(baseUrl)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("_")}`;
  return {
    kind: "NATIVE",
    read: () => SecureStore.getItemAsync(key),
    write: (token) =>
      SecureStore.setItemAsync(key, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    clear: () => SecureStore.deleteItemAsync(key),
  };
}
