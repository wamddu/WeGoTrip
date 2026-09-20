import type { RefreshStorage } from "./refresh-storage-contract";

export function createRefreshStorage(baseUrl: string): RefreshStorage {
  const marker = `wego.logout.${baseUrl}`;
  return {
    kind: "WEB",
    read: async () => null, // The refresh credential is an HttpOnly cookie, never JS-readable.
    write: async () => {
      localStorage.removeItem(marker);
    },
    clear: async () => {
      localStorage.setItem(marker, "1");
    },
    canRestore: async () => localStorage.getItem(marker) !== "1",
    // Serialize cookie rotation across tabs on supported browsers.
    exclusive: async (action) =>
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request(`wego.refresh.${baseUrl}`, action)
        : action(),
  };
}
