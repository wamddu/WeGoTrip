import { Redirect, router, usePathname } from "expo-router";
import { Stack } from "expo-router/stack";
import { View } from "react-native";
import { useTravel } from "../../state/travel-provider";
import { Busy } from "../../ui/components";
import { bottomNavigation, MAIN_SCREENS } from "../../ui/bottom-navigation";
import { BottomBar, Frame } from "../../ui/shell";
import { palette as p } from "../../ui/theme";

export default function AuthenticatedLayout() {
  const { session, loading, data, busy } = useTravel();
  const pathname = usePathname();
  if (loading) return <Busy />;
  if (!session) return <Redirect href="/login" />;
  const navigation = bottomNavigation(pathname, {
    trips: data?.trips ?? [],
    userId: session.user.id,
    busy,
    loading,
  });
  return (
    <Frame>
      <View style={{ flex: 1, minHeight: 0 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: p.bg },
          }}
        >
          {MAIN_SCREENS.map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              options={{ animation: "none" }}
            />
          ))}
        </Stack>
      </View>
      {navigation.visible && (
        <BottomBar
          add={() => router.push(navigation.addHref)}
          addDisabled={navigation.addDisabled}
        />
      )}
    </Frame>
  );
}
