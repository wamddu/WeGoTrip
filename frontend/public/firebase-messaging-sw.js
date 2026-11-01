/* Public Firebase client configuration only. Never put service-account keys here. */
self.addEventListener("notificationclick", (event) => {
  const data =
    event.notification.data?.FCM_MSG?.data ?? event.notification.data;
  if (data?.type !== "CHAT_MESSAGE" && data?.type !== "TRIP_NOTICE") return;
  const payload = {
    type: data.type,
    recipientId: data.recipientId,
    tripId: data.tripId,
    eventId: data.eventId,
    deliveryId: data.deliveryId,
    ...(data.type === "CHAT_MESSAGE"
      ? { partyId: data.partyId, messageId: data.messageId }
      : { noticeId: data.noticeId }),
  };
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (item) => new URL(item.url).origin === self.location.origin,
      );
      if (client) {
        client.postMessage({ type: "WEGOTRIP_PUSH_OPEN", payload });
        await client.focus();
      } else {
        const url = new URL("/", self.location.origin);
        url.searchParams.set("push", JSON.stringify(payload));
        await self.clients.openWindow(url.href);
      }
    })(),
  );
});
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js",
);
const config = JSON.parse(
  new URL(self.location.href).searchParams.get("config"),
);
firebase.initializeApp(config);
firebase.messaging();
