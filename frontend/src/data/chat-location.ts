export interface LocationInput {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
}

export interface ChatLocation {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  capturedAt: string;
  revokedAt: string | null;
}

export const LOCATION_MAX_AGE_MS = 120_000;
export const LOCATION_TIMEOUT_MS = 15_000;

export class LocationPermissionError extends Error {
  constructor(
    message: string,
    public openSettings = false,
  ) {
    super(message);
  }
}

export function locationInput(
  coordinates: { latitude: number; longitude: number; accuracy: number | null },
  timestamp: number,
  now = Date.now(),
): LocationInput {
  const { latitude, longitude, accuracy } = coordinates;
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    throw new Error("위치 좌표를 확인하지 못했어요. 다시 측정해 주세요.");
  if (
    !Number.isFinite(timestamp) ||
    now - timestamp >= LOCATION_MAX_AGE_MS ||
    timestamp - now > 60_000
  )
    throw new Error("최근 위치를 가져오지 못했어요. 다시 측정해 주세요.");
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
    accuracyM:
      accuracy !== null &&
      Number.isFinite(accuracy) &&
      accuracy >= 0 &&
      accuracy <= 1_000_000
        ? Number(accuracy.toFixed(2))
        : null,
    capturedAt: new Date(timestamp).toISOString(),
  };
}

export function checkLocationRequest(signal: AbortSignal) {
  if (signal.aborted) throw new Error("위치 확인을 취소했어요.");
}

export function waitForLocation<T>(
  result: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => fail(new Error("위치 확인을 취소했어요."));
    const timeout = setTimeout(
      () => fail(new Error("위치 확인 시간이 초과됐어요. 다시 측정해 주세요.")),
      LOCATION_TIMEOUT_MS,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    result.then((fix) => {
      clean();
      resolve(fix);
    }, fail);
    // Both a timed-out fix and a canceled fix may still resolve on the OS side.
    function clean() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
    function fail(error: unknown) {
      clean();
      reject(error);
    }
  });
}

export function mapsLocationUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
