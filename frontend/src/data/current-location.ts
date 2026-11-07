import * as Location from "expo-location";
import {
  LocationPermissionError,
  checkLocationRequest,
  locationInput,
  waitForLocation,
} from "./chat-location";

export async function measureCurrentLocation(signal: AbortSignal) {
  checkLocationRequest(signal);
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("기기의 위치 서비스를 켜 주세요.");
  checkLocationRequest(signal);
  let permission = await Location.getForegroundPermissionsAsync();
  checkLocationRequest(signal);
  if (!permission.granted && permission.canAskAgain)
    permission = await Location.requestForegroundPermissionsAsync();
  checkLocationRequest(signal);
  if (!permission.granted)
    throw new LocationPermissionError(
      "위치 접근 권한을 허용해 주세요.",
      !permission.canAskAgain,
    );
  const fix = await waitForLocation(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    signal,
  );
  checkLocationRequest(signal);
  return locationInput(fix.coords, fix.timestamp);
}
