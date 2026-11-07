import {
  LOCATION_TIMEOUT_MS,
  LocationPermissionError,
  checkLocationRequest,
  locationInput,
  waitForLocation,
} from "./chat-location";

export async function measureCurrentLocation(signal: AbortSignal) {
  checkLocationRequest(signal);
  if (!globalThis.isSecureContext || !navigator.geolocation)
    throw new Error(
      "위치 공유는 위치 접근을 지원하는 HTTPS 페이지에서 사용할 수 있어요.",
    );
  const fix = await waitForLocation(
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          if (error.code === 1)
            reject(
              new LocationPermissionError(
                "브라우저의 사이트 설정에서 위치 권한을 허용해 주세요.",
              ),
            );
          else if (error.code === 3)
            reject(
              new Error("위치 확인 시간이 초과됐어요. 다시 측정해 주세요."),
            );
          else
            reject(
              new Error(
                "위치를 확인할 수 없어요. 기기의 위치 서비스를 확인해 주세요.",
              ),
            );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: LOCATION_TIMEOUT_MS,
        },
      );
    }),
    signal,
  );
  checkLocationRequest(signal);
  return locationInput(fix.coords, fix.timestamp);
}
