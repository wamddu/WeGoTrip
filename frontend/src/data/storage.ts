import { File, Paths } from "expo-file-system";
import type { KeyValueStorage } from "./contracts";
const file = (key: string) => new File(Paths.document, `wegotrip-${key}.json`);
export const storage: KeyValueStorage = {
  async read(key) {
    const target = file(key);
    return target.exists ? await target.text() : null;
  },
  async write(key, value) {
    file(key).write(value);
  },
  async remove(key) {
    const target = file(key);
    if (target.exists) target.delete();
  },
};
