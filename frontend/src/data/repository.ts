import { UserTravelRepository } from "./user-travel-repository";
import { MockTravelRepository } from "./mock-repository";
import { storage } from "./storage";
import type { TravelRepository } from "./contracts";
import { createRefreshStorage } from "./refresh-storage";
if (
  process.env.EXPO_PUBLIC_DATA_SOURCE &&
  !["mock", "http"].includes(process.env.EXPO_PUBLIC_DATA_SOURCE)
) {
  throw new Error("EXPO_PUBLIC_DATA_SOURCE는 mock 또는 http로 설정해 주세요.");
}
export const repository: TravelRepository =
  process.env.EXPO_PUBLIC_DATA_SOURCE === "http"
    ? new UserTravelRepository(
        process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/api",
        storage,
        createRefreshStorage(
          process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/api",
        ),
      )
    : new MockTravelRepository(storage);
