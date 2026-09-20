import type { Coordinates } from "../domain/models";
import { validCoordinates } from "../domain/route";

// The Google key stays in the backend; this public URL contains no credentials.
export const mapsApiUrl = (
  process.env.EXPO_PUBLIC_MAPS_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://localhost:8080/api"
).replace(/\/$/, "");

export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  category: string;
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSearchResult[]> {
  const text = query.trim();
  if (!text || text.length > 150)
    throw new Error("검색어를 1~150자로 입력해 주세요.");
  const response = await fetch(
    `${mapsApiUrl}/maps/places/search?query=${encodeURIComponent(text)}`,
    { signal },
  );
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "message" in result
        ? result.message
        : null;
    throw new Error(
      typeof message === "string" ? message : "장소 검색을 완료하지 못했어요.",
    );
  }
  if (!Array.isArray(result)) throw new Error("검색 결과를 읽지 못했어요.");
  return result.filter(
    (item): item is PlaceSearchResult =>
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.address === "string" &&
      typeof item.category === "string" &&
      validCoordinates(item.coordinates),
  );
}

export function googleMapImageUrl(
  center: Coordinates,
  zoom: number,
  width: number,
) {
  return `${mapsApiUrl}/maps/image?latitude=${center.latitude}&longitude=${center.longitude}&zoom=${zoom}&width=${width}`;
}
