import { createPushPlatform } from "./platform";
import { pushText, type PushHandlers } from "./push-message";

export async function listenPushes(
  handlers: PushHandlers,
): Promise<() => void> {
  if (!(await createPushPlatform())) return () => {};
  const fcm = await import("@react-native-firebase/messaging");
  const notifications = await import("expo-notifications");
  const messaging = fcm.getMessaging();
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  let active = true;
  const received = fcm.onMessage(messaging, async (message) => {
    if (!active || !handlers.foreground(message.data)) return;
    const permission = await notifications
      .getPermissionsAsync()
      .catch(() => null);
    if (
      !active ||
      !permission ||
      (!permission.granted &&
        permission.ios?.status !==
          notifications.IosAuthorizationStatus.PROVISIONAL)
    )
      return;
    await notifications
      .scheduleNotificationAsync({
        identifier: `push-${message.data?.deliveryId}`,
        content: {
          ...pushText(message.data),
          data: message.data,
          sound: "default",
        },
        trigger: { channelId: "default" },
      })
      .catch(() => undefined);
  });
  const opened = fcm.onNotificationOpenedApp(messaging, (message) => {
    if (active) handlers.open(message.data);
  });
  const response = notifications.addNotificationResponseReceivedListener(
    (event) => {
      if (active) handlers.open(event.notification.request.content.data);
    },
  );
  void fcm
    .getInitialNotification(messaging)
    .then((message) => {
      if (active && message) handlers.open(message.data);
    })
    .catch(() => undefined);
  void notifications
    .getLastNotificationResponseAsync()
    .then((event) => {
      if (active && event) {
        handlers.open(event.notification.request.content.data);
        void notifications
          .clearLastNotificationResponseAsync()
          .catch(() => undefined);
      }
    })
    .catch(() => undefined);
  return () => {
    active = false;
    received();
    opened();
    response.remove();
  };
}
