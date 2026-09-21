import { getApps, initializeApp } from "firebase/app";
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
} from "firebase/messaging";
import type { PushPlatform } from "./contracts";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const vapidKey = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;
export async function createPushPlatform(): Promise<PushPlatform | null> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !vapidKey ||
    Object.values(config).some((value) => !value) ||
    !(await isSupported())
  )
    return null;
  const app =
    getApps().find((item) => item.name === "wegotrip-push") ??
    initializeApp(config, "wegotrip-push");
  const messaging = getMessaging(app);
  return {
    deviceType: "WEB",
    permission: async () =>
      Notification.permission === "default"
        ? "undetermined"
        : Notification.permission,
    requestPermission: async () => {
      const value = await Notification.requestPermission();
      return value === "default" ? "undetermined" : value;
    },
    token: async () => {
      const url = `/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(config))}`;
      const registration = await navigator.serviceWorker.register(url);
      await navigator.serviceWorker.ready;
      return getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
    },
    deleteToken: async () => {
      await deleteToken(messaging);
    },
    subscribe(listener) {
      window.addEventListener("focus", listener);
      return () => window.removeEventListener("focus", listener);
    },
    openSettings: async () => {
      /* Browsers do not expose a standard site-settings URL. UI shows instructions. */
    },
  };
}
