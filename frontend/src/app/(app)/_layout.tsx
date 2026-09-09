import { Redirect } from "expo-router";
import { Stack } from "expo-router/stack";
import { useTravel } from "../../state/travel-provider";
import { Busy } from "../../ui/components";
export default function AuthenticatedLayout() {
  const { session, loading } = useTravel();
  if (loading) return <Busy />;
  if (!session) return <Redirect href="/login" />;
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: "slide_from_right" }}
    />
  );
}
