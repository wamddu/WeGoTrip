import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TravelProvider } from "../state/travel-provider";
import { PushNavigation } from "../notifications/push-navigation";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TravelProvider>
        <StatusBar style="dark" />
        <PushNavigation />
        <Stack screenOptions={{ headerShown: false, animation: "none" }} />
      </TravelProvider>
    </SafeAreaProvider>
  );
}
//dd
