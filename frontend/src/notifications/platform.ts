import Constants from "expo-constants";
import { AppState, Linking, Platform } from "react-native";
import type { PushPermission, PushPlatform } from "./contracts";

export async function createPushPlatform(): Promise<PushPlatform | null> {
  if (
    Constants.appOwnership === "expo" ||
    !Constants.expoConfig?.extra?.pushConfigured?.[Platform.OS]
  )
    return null;
  const notifications = await import("expo-notifications");
  const fcm = await import("@react-native-firebase/messaging");
  const messaging = fcm.getMessaging();
  if (Platform.OS === "android")
    await notifications.setNotificationChannelAsync("default", {
      name: "여행 알림",
      importance: notifications.AndroidImportance.DEFAULT,
    });
  const permission = (
    value: Awaited<ReturnType<typeof notifications.getPermissionsAsync>>,
  ): PushPermission =>
    value.granted ||
    value.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL
      ? "granted"
      : value.status === "undetermined"
        ? "undetermined"
        : "denied";
  return {
    deviceType: Platform.OS === "ios" ? "IOS" : "ANDROID",
    permission: async () =>
      permission(await notifications.getPermissionsAsync()),
    requestPermission: async () =>
      permission(await notifications.requestPermissionsAsync()),
    token: async () => {
      if (
        Platform.OS === "ios" &&
        !messaging.isDeviceRegisteredForRemoteMessages
      )
        await fcm.registerDeviceForRemoteMessages(messaging);
      await fcm.setAutoInitEnabled(messaging, true);
      return fcm.getToken(messaging);
    },
    deleteToken: async () => {
      await fcm.setAutoInitEnabled(messaging, false);
      await fcm.deleteToken(messaging);
    },
    subscribe(listener) {
      const token = fcm.onTokenRefresh(messaging, listener);
      const state = AppState.addEventListener("change", (value) => {
        if (value === "active") listener();
      });
      return () => {
        token();
        state.remove();
      };
    },
    openSettings: () => Linking.openSettings(),
  };
}
