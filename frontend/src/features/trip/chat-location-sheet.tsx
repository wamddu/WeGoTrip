import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ChatApi } from "../../data/chat-api";
import {
  LOCATION_MAX_AGE_MS,
  LocationPermissionError,
  type LocationInput,
} from "../../data/chat-location";
import { measureCurrentLocation } from "../../data/current-location";
import { requestKey } from "../../data/trip-api";
import { ApiError, type UserApi } from "../../data/user-api";
import {
  Button,
  ErrorMessage,
  IconButton,
  styles as s,
} from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { ChatLocationMap, LocationDetails } from "./chat-location-map";

type Draft = { input: LocationInput; key: string; url: string | null };

export function ChatLocationSheet({
  api,
  userApi,
  roomName,
  onSend,
  onClose,
}: {
  api: ChatApi;
  userApi: UserApi;
  roomName: string;
  onSend(input: LocationInput, key: string): Promise<unknown>;
  onClose(): void;
}) {
  const navigation = useNavigation();
  const request = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<"measure" | "map" | "send" | null>(
    "measure",
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<"profile" | "device" | null>(null);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);
  const dismiss = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);
  const prepare = useCallback(
    async (previous?: Draft) => {
      if (request.current) return;
      const operation = new AbortController();
      request.current = operation;
      const active = () =>
        request.current === operation && !operation.signal.aborted;
      setError("");
      setSettings(null);
      setMapReady(false);
      setPhase(previous ? "map" : "measure");
      if (!previous) {
        setDraft(null);
        setAttempted(false);
        setExpired(false);
      }
      try {
        let next = previous;
        if (!next) {
          const preference = await userApi.settings();
          if (!active()) return;
          if (!preference.locationSharingEnabled) {
            setSettings("profile");
            setError("프로필에서 위치 공유를 켜 주세요.");
            return;
          }
          const input = await measureCurrentLocation(operation.signal);
          if (!active()) return;
          next = { input, key: requestKey(), url: null };
        }
        setDraft({ ...next, url: null });
        setPhase("map");
        const preview = await api.previewLocation(next.input);
        if (active()) setDraft({ ...next, url: preview.url });
      } catch (cause) {
        if (!active()) return;
        if (cause instanceof LocationPermissionError && cause.openSettings)
          setSettings("device");
        if (
          cause instanceof ApiError &&
          cause.code === "LOCATION_SHARING_DISABLED"
        )
          setSettings("profile");
        setError(
          cause instanceof Error ? cause.message : "위치를 확인하지 못했어요.",
        );
      } finally {
        if (active()) {
          request.current = null;
          setPhase(null);
        }
      }
    },
    [api, userApi],
  );

  useEffect(() => {
    void prepare();
    return cancel;
  }, [prepare, cancel]);
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      if (state === "background") dismiss();
    });
    const blur = navigation.addListener("blur", dismiss);
    const visibility = () => {
      if (document.hidden) dismiss();
    };
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", visibility);
    return () => {
      app.remove();
      blur();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", visibility);
    };
  }, [dismiss, navigation]);
  const capturedAt = draft?.input.capturedAt;
  useEffect(() => {
    if (!capturedAt) return;
    const expiresIn = Date.parse(capturedAt) + LOCATION_MAX_AGE_MS - Date.now();
    setExpired(expiresIn <= 0);
    if (expiresIn <= 0) return;
    const timer = setTimeout(() => setExpired(true), expiresIn);
    return () => clearTimeout(timer);
  }, [capturedAt]);

  async function send() {
    if (request.current || !draft || !mapReady) return;
    if (
      !attempted &&
      Date.now() - Date.parse(draft.input.capturedAt) >= LOCATION_MAX_AGE_MS
    ) {
      setExpired(true);
      return;
    }
    const operation = new AbortController();
    request.current = operation;
    setPhase("send");
    setAttempted(true);
    setError("");
    try {
      await onSend(draft.input, draft.key);
      if (!operation.signal.aborted) dismiss();
    } catch (cause) {
      if (operation.signal.aborted) return;
      if (cause instanceof ApiError && cause.code === "LOCATION_EXPIRED") {
        setExpired(true);
        setAttempted(false);
      }
      if (
        cause instanceof ApiError &&
        cause.code === "LOCATION_SHARING_DISABLED"
      )
        setSettings("profile");
      setError(
        cause instanceof Error ? cause.message : "위치를 보내지 못했어요.",
      );
    } finally {
      if (request.current === operation) {
        request.current = null;
        setPhase(null);
      }
    }
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={s.between}>
              <Text style={s.sectionTitle}>내 위치 보내기</Text>
              <IconButton
                name="close"
                label="위치 미리보기 닫기"
                onPress={dismiss}
              />
            </View>
            <Text style={s.small}>공유 대상 · {roomName}</Text>
            {phase === "measure" && (
              <View style={styles.measure}>
                <ActivityIndicator color={p.primary} />
                <Text style={s.body}>현재 위치를 확인하고 있어요…</Text>
              </View>
            )}
            {draft && (
              <>
                <ChatLocationMap
                  url={draft.url}
                  loading={
                    phase === "map" || (!!draft.url && !mapReady && !error)
                  }
                  onLoad={() => setMapReady(true)}
                  onError={() => {
                    setMapReady(false);
                    setDraft((current) =>
                      current?.key === draft.key
                        ? { ...current, url: null }
                        : current,
                    );
                    setError("지도를 불러오지 못했어요. 다시 시도해 주세요.");
                  }}
                />
                <LocationDetails
                  capturedAt={draft.input.capturedAt}
                  accuracyM={draft.input.accuracyM}
                />
                <Text style={s.small}>
                  지도 표시를 위해 이 좌표를 Google 지도에 전달해요. 채팅에는
                  보내기를 누른 뒤 표시돼요.
                </Text>
              </>
            )}
            <ErrorMessage
              message={
                error ||
                (expired && !attempted
                  ? "측정한 지 시간이 지났어요. 다시 측정해 주세요."
                  : "")
              }
            />
            {settings === "profile" && (
              <Button
                title="프로필 설정 열기"
                secondary
                onPress={() => {
                  dismiss();
                  router.push("/profile");
                }}
              />
            )}
            {settings === "device" && (
              <Button
                title="기기 설정 열기"
                secondary
                onPress={() => {
                  void Linking.openSettings().catch(() =>
                    setError("기기 설정에서 위치 접근을 허용해 주세요."),
                  );
                }}
              />
            )}
            {draft && !draft.url && !expired && !phase && (
              <Button
                title="지도 다시 불러오기"
                secondary
                onPress={() => void prepare(draft)}
              />
            )}
            <View style={styles.actions}>
              <View style={s.flex}>
                <Button
                  title="취소"
                  secondary
                  onPress={dismiss}
                  disabled={phase === "send"}
                />
              </View>
              <View style={s.flex}>
                <Button
                  title="다시 측정"
                  secondary
                  onPress={() => void prepare()}
                  disabled={!!phase}
                />
              </View>
            </View>
            <Button
              title={attempted ? "같은 위치 다시 보내기" : "이 위치 보내기"}
              icon="send"
              loading={phase === "send"}
              disabled={
                !draft ||
                !mapReady ||
                !!phase ||
                (expired && !attempted) ||
                !!settings
              }
              onPress={() => void send()}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#152B4866",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: p.white,
  },
  content: { padding: 18, paddingBottom: 30, gap: 12 },
  measure: {
    minHeight: 95,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actions: { flexDirection: "row", gap: 8 },
});
