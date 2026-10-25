import { useEffect, useRef, useState } from "react";
import { useRootNavigationState, useRouter } from "expo-router";
import { useTravel } from "../state/travel-provider";
import { listenPushes } from "./receiver";
import { pushHref, parsePush, SeenPushes, type AppPush } from "./push-message";

export function PushNavigation() {
  const { session, loading, refresh } = useTravel();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const user = useRef(session?.user.id);
  user.current = session?.user.id;
  const seen = useRef(new SeenPushes());
  const [pending, setPending] = useState<AppPush | null>(null);
  useEffect(() => {
    let active = true;
    let stop = () => {};
    void listenPushes({
      foreground(raw) {
        const data = parsePush(raw);
        return (
          !!data &&
          active &&
          data.recipientId === user.current &&
          seen.current.accept("display", data)
        );
      },
      open(raw) {
        const data = parsePush(raw);
        if (active && data && seen.current.accept("open", data))
          setPending(data);
      },
    })
      .then((unsubscribe) => {
        if (active) stop = unsubscribe;
        else unsubscribe();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop();
    };
  }, []);
  useEffect(() => {
    if (!pending || loading || !session || !navigation?.key) return;
    if (pending.recipientId !== session.user.id) {
      setPending(null);
      return;
    }
    let active = true;
    void refresh()
      .then(() => {
        if (!active || user.current !== pending.recipientId) return;
        router.push(pushHref(pending));
        setPending(null);
      })
      .catch(() => {
        if (active) setPending(null);
      });
    return () => {
      active = false;
    };
  }, [pending, session?.user.id, loading, navigation?.key, refresh, router]);
  return null;
}
