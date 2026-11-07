import { Image } from "expo-image";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Icon, styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";

export function ChatLocationMap({
  url,
  loading,
  onLoad,
  onError,
}: {
  url: string | null;
  loading?: boolean;
  onLoad?(): void;
  onError(): void;
}) {
  return (
    <View style={styles.frame}>
      <View style={styles.placeholder} accessible={false}>
        {loading ? (
          <ActivityIndicator color={p.primary} />
        ) : (
          <Icon name="map" color={p.secondary} />
        )}
      </View>
      {url && (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="none"
          accessibilityLabel="공유 위치에 핀이 표시된 Google 지도"
          onLoad={onLoad}
          onError={onError}
        />
      )}
    </View>
  );
}

export function LocationDetails({
  capturedAt,
  accuracyM,
}: {
  capturedAt: string;
  accuracyM: number | null;
}) {
  const captured = new Date(capturedAt);
  return (
    <View style={{ gap: 3 }}>
      <Text style={s.small}>
        {captured.toLocaleString("ko-KR", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        측정
        {accuracyM !== null ? ` · 정확도 약 ${Math.round(accuracyM)}m` : ""}
      </Text>
      {accuracyM !== null && accuracyM > 100 && (
        <Text style={s.small}>대략적인 위치예요.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 1.6,
    overflow: "hidden",
    borderRadius: 9,
    backgroundColor: p.bg,
  },
  placeholder: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
