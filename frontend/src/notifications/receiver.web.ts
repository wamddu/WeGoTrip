import { getApps } from "firebase/app";
import { getMessaging, onMessage } from "firebase/messaging";
import { createPushPlatform } from "./platform.web";
import { pushText, type PushHandlers } from "./push-message";

export async function listenPushes(
  handlers: PushHandlers,
): Promise<() => void> {
  if (typeof window === "undefined") return () => {};
  const open = (event: MessageEvent) => {
    if (event.data?.type === "WEGOTRIP_PUSH_OPEN")
      handlers.open(event.data.payload);
  };
  navigator.serviceWorker?.addEventListener("message", open);
  const url = new URL(window.location.href);
  const initial = url.searchParams.get("push");
  if (initial && initial.length < 2048) {
    try {
      handlers.open(JSON.parse(initial));
    } catch {
      /* Ignore malformed external data. */
    }
    url.searchParams.delete("push");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
  let unsubscribe = () => {};
  try {
    if (await createPushPlatform()) {
      const messaging = getMessaging(
        getApps().find((app) => app.name === "wegotrip-push")!,
      );
      unsubscribe = onMessage(messaging, (message) => {
        if (
          !handlers.foreground(message.data) ||
          Notification.permission !== "granted"
        )
          return;
        const content = pushText(message.data);
        const notification = new Notification(content.title, {
          body: content.body,
          tag: `push-${message.data?.deliveryId}`,
        });
        notification.onclick = () => {
          window.focus();
          handlers.open(message.data);
          notification.close();
        };
      });
    }
  } catch {
    /* Push configuration failure does not interrupt login or chat. */
  }
  return () => {
    unsubscribe();
    navigator.serviceWorker?.removeEventListener("message", open);
  };
}
