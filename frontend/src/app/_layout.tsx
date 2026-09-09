import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TravelProvider } from "../state/travel-provider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <TravelProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{ headerShown: false, animation: "slide_from_right" }}
        />
      </TravelProvider>
    </SafeAreaProvider>
  );
}
