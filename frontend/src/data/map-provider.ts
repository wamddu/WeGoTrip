// Public raster tile configuration. Swap this provider independently of trip data APIs.
export const mapProvider = {
  tileUrl:
    process.env.EXPO_PUBLIC_MAP_TILE_URL ||
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    process.env.EXPO_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors",
  attributionUrl:
    process.env.EXPO_PUBLIC_MAP_ATTRIBUTION_URL ||
    "https://www.openstreetmap.org/copyright",
  userAgent: "WeGoTrip/1.0 (com.jeongheaum.frontend)",
};

export function tileUrl(zoom: number, x: number, y: number) {
  return mapProvider.tileUrl
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}
