import { useEffect, useRef, useState } from "react";
import type { UserApi } from "../data/user-api";
import { storage } from "../data/storage";
import { DeviceRegistration } from "./device-registration";
import { createPushPlatform } from "./platform";
import type { PushFailure, PushState } from "./contracts";

export function useDeviceRegistration(
  api: UserApi | undefined,
  userId?: string,
) {
  const [status, setStatus] = useState<PushState>("idle");
  const [failure, setFailure] = useState<PushFailure>();
  const [attempt, setAttempt] = useState(0);
  const current = useRef<DeviceRegistration | null>(null);
  const generation = useRef(0);
  const stopping = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const epoch = ++generation.current;
    if (!api || !userId) {
      setStatus("idle");
      return;
    }
    let active = true;
    let registration: DeviceRegistration | undefined;
    setStatus("checking");
    void (async () => {
      await stopping.current;
      const platform = await createPushPlatform();
      if (!active || epoch !== generation.current) return;
      if (!platform) {
        setStatus("unavailable");
        return;
      }
      registration = new DeviceRegistration(
        api,
        storage,
        platform,
        process.env.EXPO_PUBLIC_API_URL ?? "",
        userId,
        (value, detail) => {
          if (active && epoch === generation.current) { setStatus(value); setFailure(detail); }
        },
      );
      current.current = registration;
      await registration.start();
    })().catch(() => {
      if (active && epoch === generation.current) setStatus("error");
    });
    return () => {
      active = false;
      registration?.cancel();
    };
  }, [api, userId, attempt]);
  return {
    status,
    failure,
    request: () => current.current?.request() ?? Promise.resolve(),
    dismiss: () => current.current?.dismiss() ?? Promise.resolve(),
    retry: () => {
      if (current.current) return current.current.sync();
      setAttempt((value) => value + 1);
      return Promise.resolve();
    },
    openSettings: () => current.current?.openSettings() ?? Promise.resolve(),
    disconnect(authenticated = true) {
      generation.current++;
      const registration = current.current;
      current.current = null;
      // Failures in push setup/cleanup never make ordinary login/logout fail.
      stopping.current = stopping.current
        .then(() => registration?.stop(authenticated))
        .catch(() => undefined);
      registration?.cancel();
      return stopping.current;
    },
  };
}
