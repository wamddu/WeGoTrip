import { Stack } from "expo-router/stack";
import { TripProvider } from "../../../../features/trip/trip-context";
export default function TripLayout() {
  return (
    <TripProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </TripProvider>
  );
}
