import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { remainingPollMs } from "../../data/poll-deadline";
import type { ChatPoll } from "../../data/chat-api";

export function usePollTimer(poll: ChatPoll | null) {
  const [now, tick] = useState(() => performance.now());
  const serverNow = poll?.serverNow;
  const closesAt = poll?.closesAt;
  const sample = useMemo(
    () => ({
      time: serverNow ?? new Date().toISOString(),
      received: performance.now(),
    }),
    [serverNow],
  );
  const remaining = closesAt
    ? remainingPollMs(closesAt, sample.time, now - sample.received)
    : null;
  const closed = !!poll?.closed || remaining === 0;
  useEffect(() => {
    if (!closesAt || closed) return;
    const update = () => tick(performance.now());
    const interval = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [closesAt, closed, sample]);
  return { closed, remaining };
}
