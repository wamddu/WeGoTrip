import { Redirect } from "expo-router";
import { useTravel } from "../state/travel-provider";
import { Busy } from "../ui/components";
export default function Index() {
  const { loading, session } = useTravel();
  return loading ? <Busy /> : <Redirect href={session ? "/home" : "/login"} />;
}
