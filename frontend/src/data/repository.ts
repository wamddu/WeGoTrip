import { HttpTravelRepository } from "./http-repository";
import { MockTravelRepository } from "./mock-repository";
import { storage } from "./storage";
import type { TravelRepository } from "./contracts";
if (
  process.env.EXPO_PUBLIC_DATA_SOURCE &&
  !["mock", "http"].includes(process.env.EXPO_PUBLIC_DATA_SOURCE)
) {
  throw new Error("EXPO_PUBLIC_DATA_SOURCE는 mock 또는 http로 설정해 주세요.");
}
export const repository: TravelRepository =
  process.env.EXPO_PUBLIC_DATA_SOURCE === "http"
    ? new HttpTravelRepository(process.env.EXPO_PUBLIC_API_URL ?? "")
    : new MockTravelRepository(storage);
