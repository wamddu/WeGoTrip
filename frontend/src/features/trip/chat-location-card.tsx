import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatMessage } from "../../data/chat-api";
import { mapsLocationUrl } from "../../data/chat-location";
import { ApiError } from "../../data/user-api";
import { Button, ErrorMessage, Icon, styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { useChatRoom } from "./chat-context";
import { ChatLocationMap, LocationDetails } from "./chat-location-map";
import { useVisibleChatMap } from "./chat-scroll-view";

export function ChatLocationCard({
  message,
  mine,
}: {
  message: ChatMessage;
  mine: boolean;
}) {
  const chat = useChatRoom();
  const location = message.location;
  if (
    !location ||
    location.revokedAt ||
    location.latitude === null ||
    location.longitude === null
  ) {
    return (
      <Text style={s.small}>
        {location?.revokedAt
          ? "위치 공유가 취소되었어요."
          : "공유 위치를 표시할 수 없어요."}
      </Text>
    );
  }
  return (
    <Snapshot
      key={`${chat.roomKey}:${message.id}:${message.revision}`}
      message={message}
      mine={mine}
      latitude={location.latitude}
      longitude={location.longitude}
    />
  );
}

function Snapshot({
  message,
  mine,
  latitude,
  longitude,
}: {
  message: ChatMessage;
  mine: boolean;
  latitude: number;
  longitude: number;
}) {
  const { api, busy, revokeLocation } = useChatRoom();
  const [mapRef, visible] = useVisibleChatMap();
  const [url, setUrl] = useState<string | null>(null);
  const [mapError, setMapError] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [revoked, setRevoked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!visible || !api) return;
    let active = true;
    setUrl(null);
    setMapError("");
    void api
      .locationMap(message.id)
      .then((map) => {
        if (active && map.revision === message.revision) setUrl(map.url);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (
          cause instanceof ApiError &&
          (cause.status === 410 ||
            cause.status === 404 ||
            cause.status === 403 ||
            cause.status === 401)
        ) {
          setRevoked(true);
        } else
          setMapError(
            cause instanceof Error
              ? cause.message
              : "지도를 불러오지 못했어요.",
          );
      });
    return () => {
      active = false;
    };
  }, [api, message.id, message.revision, visible, retry]);

  const open = () => {
    setError("");
    void Linking.openURL(mapsLocationUrl(latitude, longitude)).catch(() =>
      setError("Google 지도를 열 수 없어요."),
    );
  };
  const revoke = async () => {
    try {
      setError("");
      await revokeLocation(message.id);
      setConfirm(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "위치 공유를 취소하지 못했어요.",
      );
    }
  };
  if (revoked)
    return <Text style={s.small}>공유 위치를 표시할 수 없어요.</Text>;
  return (
    <View style={styles.card}>
      <View style={styles.label}>
        <Icon name="pin" size={16} color={p.primary} />
        <Text style={s.strong}>공유 당시 위치</Text>
      </View>
      <View ref={mapRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="공유 위치를 Google 지도에서 열기"
          onPress={open}
        >
          <ChatLocationMap
            url={url}
            loading={visible && !mapError && !url}
            onError={() => {
              setUrl(null);
              setMapError("지도를 불러오지 못했어요.");
            }}
          />
        </Pressable>
      </View>
      <LocationDetails
        capturedAt={message.location!.capturedAt}
        accuracyM={message.location!.accuracyM}
      />
      <Pressable accessibilityRole="button" onPress={open}>
        <Text style={styles.link}>Google 지도에서 열기 ↗</Text>
      </Pressable>
      <ErrorMessage message={mapError || error} />
      {!!mapError && (
        <Button
          title="지도 다시 불러오기"
          secondary
          onPress={() => setRetry((value) => value + 1)}
        />
      )}
      {mine && !confirm && (
        <Pressable accessibilityRole="button" onPress={() => setConfirm(true)}>
          <Text style={styles.cancel}>위치 공유 취소</Text>
        </Pressable>
      )}
      {mine && confirm && (
        <View style={{ gap: 6 }}>
          <Text style={s.small}>이 채팅에서 공유한 위치를 숨길까요?</Text>
          <Button
            title="공유 취소하기"
            danger
            disabled={busy}
            onPress={() => void revoke()}
          />
          <Button
            title="그대로 두기"
            secondary
            disabled={busy}
            onPress={() => setConfirm(false)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  label: { flexDirection: "row", alignItems: "center", gap: 5 },
  link: { color: p.primaryDark, fontWeight: "600", paddingVertical: 4 },
  cancel: { color: p.secondary, fontSize: 12, paddingVertical: 4 },
});
