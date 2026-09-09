import type { KeyValueStorage } from "./contracts";
export const storage: KeyValueStorage = {
  async read(key) {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(`wegotrip-${key}`);
  },
  async write(key, value) {
    window.localStorage.setItem(`wegotrip-${key}`, value);
  },
  async remove(key) {
    window.localStorage.removeItem(`wegotrip-${key}`);
  },
};
