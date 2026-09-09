import { Redirect } from "expo-router";
import AuthScreen from "../features/auth/auth-screen";
import { useTravel } from "../state/travel-provider";
import { Busy } from "../ui/components";
export default function LoginRoute() {
  const { loading, session } = useTravel();
  if (loading) return <Busy />;
  return session ? <Redirect href="/home" /> : <AuthScreen />;
}
