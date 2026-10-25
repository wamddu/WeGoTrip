import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  sendPhotoAttachments,
  type ChatPhoto,
  type PhotoAttachment,
} from "../../data/chat-photo-batch";
import {
  importPhotos,
  listPhotos,
  managePhotoAccess,
  photoPermission,
  PHOTO_PAGE_SIZE,
  uploadPhoto,
  watchPhotos,
} from "../../data/chat-photo-library";
import { Button, Icon, styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { useChatRoom } from "./chat-context";
import { useTrip } from "./trip-context";

export function ChatPhotoSheet({ onClose }: { onClose(): void }) {
  const chat = useChatRoom();
  const { trip } = useTrip();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [photos, setPhotos] = useState<ChatPhoto[]>([]);
  const [selected, setSelected] = useState<PhotoAttachment[]>([]);
  const [permission, setPermission] = useState<Awaited<
    ReturnType<typeof photoPermission>
  > | null>(null);
  const [loading, setLoading] = useState(Platform.OS !== "web");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [gridWidth, setGridWidth] = useState(0);
  const mounted = useRef(true);
  const loadLock = useRef(false);
  const sendLock = useRef(false);
  const offset = useRef(0);
  const hasMore = useRef(Platform.OS !== "web");
  const importedUris = useRef(new Set<string>());
  const archived = useRef(trip?.archived);
  archived.current = trip?.archived;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => {
    if (!sendLock.current) closeRef.current();
  }, []);

  const load = useCallback(async (reset = false, request = false) => {
    if (Platform.OS === "web" || loadLock.current || sendLock.current) return;
    if (!reset && !hasMore.current) return;
    loadLock.current = true;
    setLoading(true);
    setError("");
    try {
      const access = await photoPermission(request);
      if (!mounted.current) return;
      setPermission(access);
      if (!access.granted && access.accessPrivileges !== "limited") {
        setPhotos([]);
        return;
      }
      const page = await listPhotos(reset ? 0 : offset.current);
      if (!mounted.current) return;
      offset.current = (reset ? 0 : offset.current) + page.length;
      hasMore.current = page.length === PHOTO_PAGE_SIZE;
      setPhotos((current) => [
        ...new Map(
          (reset ? page : [...current, ...page]).map((photo) => [
            photo.id,
            photo,
          ]),
        ).values(),
      ]);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "사진 목록을 불러오지 못했어요.",
        );
    } finally {
      loadLock.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load(true, true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    const photoSubscription = watchPhotos(() => void load(true));
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    if (Platform.OS === "web") window.addEventListener("keydown", escape);
    return () => {
      mounted.current = false;
      subscription.remove();
      photoSubscription.remove();
      if (Platform.OS === "web") {
        window.removeEventListener("keydown", escape);
        importedUris.current.forEach((uri) => URL.revokeObjectURL(uri));
        importedUris.current.clear();
      }
    };
  }, [close, load]);

  function toggle(photo: ChatPhoto) {
    if (sendLock.current) return;
    setSelected((current) =>
      current.some((item) => item.photo.id === photo.id)
        ? current.filter((item) => item.photo.id !== photo.id)
        : [...current, { photo }],
    );
    setError("");
  }

  async function addPhotos() {
    if (loadLock.current || sendLock.current) return;
    loadLock.current = true;
    try {
      setError("");
      const imported = await importPhotos();
      if (!mounted.current) {
        imported.forEach((photo) => URL.revokeObjectURL(photo.uri));
        return;
      }
      imported.forEach((photo) => importedUris.current.add(photo.uri));
      setPhotos((current) => [
        ...new Map(
          [...current, ...imported].map((photo) => [photo.id, photo]),
        ).values(),
      ]);
      setSelected((current) => [
        ...current,
        ...imported
          .filter(
            (photo) => !current.some((item) => item.photo.id === photo.id),
          )
          .map((photo) => ({ photo })),
      ]);
    } catch (cause) {
      if (mounted.current) setError((cause as Error).message);
    } finally {
      loadLock.current = false;
    }
  }

  async function changeAccess() {
    try {
      await managePhotoAccess();
      await load(true);
    } catch {
      if (mounted.current)
        setError(
          "사진 접근 범위를 바꾸지 못했어요. 기기 설정에서 사진 권한을 확인해 주세요.",
        );
    }
  }

  async function send() {
    if (
      sendLock.current ||
      !selected.length ||
      !chat.api ||
      chat.busy ||
      archived.current
    )
      return;
    sendLock.current = true;
    setSending(true);
    setError("");
    setProgress({ sent: 0, total: selected.length });
    try {
      const complete = await sendPhotoAttachments(selected, {
        upload: (photo) => uploadPhoto(photo, chat.api!),
        send: (id) => chat.send("", id),
        active: () => mounted.current && !archived.current,
        onSent: (attachment) => {
          if (!mounted.current) return;
          setSelected((current) =>
            current.filter((item) => item !== attachment),
          );
          setProgress((current) => ({ ...current, sent: current.sent + 1 }));
        },
      });
      if (mounted.current) {
        if (complete) onClose();
        else setError("종료한 여행에는 사진을 전송할 수 없어요.");
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          `${cause instanceof Error ? cause.message : "사진을 전송하지 못했어요."} 전송하지 못한 사진은 선택된 상태로 남아 있어요.`,
        );
    } finally {
      sendLock.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const granted =
    Platform.OS === "web" ||
    permission?.granted ||
    permission?.accessPrivileges === "limited";
  const cellSize = Math.max(1, (gridWidth - 4) / 3);
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={st.overlay}>
        <Pressable
          style={st.backdrop}
          onPress={close}
          disabled={sending}
          accessibilityLabel="사진 선택 닫기"
          accessibilityRole="button"
        />
        <View
          style={[
            st.sheet,
            {
              height: Math.min(height * 0.78, height - insets.top - 12),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          accessibilityViewIsModal
          accessibilityLabel="채팅 사진 선택"
        >
          <View style={st.handle} />
          <View style={st.header}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.sectionTitle}>사진 선택</Text>
              <Text style={s.small}>최근 사진 · 선택한 순서대로 전송해요</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="사진 선택 닫기"
              disabled={sending}
              onPress={close}
              style={[st.close, sending && st.disabled]}
            >
              <Icon name="close" color={p.ink} />
            </Pressable>
          </View>
          {Platform.OS === "web" && (
            <View style={st.notice}>
              <Button
                title="기기에서 사진 가져오기"
                secondary
                disabled={sending}
                onPress={() => void addPhotos()}
              />
            </View>
          )}
          {permission?.accessPrivileges === "limited" && (
            <View style={st.limited}>
              <Text style={[s.small, { flex: 1 }]}>허용한 사진만 표시돼요</Text>
              <Pressable
                accessibilityRole="button"
                disabled={sending}
                onPress={() => void changeAccess()}
                style={st.accessButton}
              >
                <Text style={st.link}>사진 더 허용</Text>
              </Pressable>
            </View>
          )}
          <View
            style={st.grid}
            onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
          >
            <FlatList
              data={photos}
              extraData={{ selected, sending, cellSize }}
              numColumns={3}
              keyExtractor={(photo) => photo.id}
              columnWrapperStyle={{ gap: 2 }}
              contentContainerStyle={{ gap: 2, flexGrow: 1 }}
              initialNumToRender={24}
              maxToRenderPerBatch={15}
              windowSize={5}
              onEndReached={() => {
                if (granted) void load();
              }}
              onEndReachedThreshold={0.6}
              renderItem={({ item, index }) => {
                const order = selected.findIndex(
                  (attachment) => attachment.photo.id === item.id,
                );
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`사진 ${index + 1}${order >= 0 ? `, ${order + 1}번째 선택` : ""}`}
                    accessibilityState={{
                      checked: order >= 0,
                      disabled: sending,
                    }}
                    disabled={sending}
                    onPress={() => toggle(item)}
                    style={[st.cell, { width: cellSize, height: cellSize }]}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={st.thumbnail}
                      contentFit="cover"
                      recyclingKey={item.id}
                    />
                    {order >= 0 && (
                      <View pointerEvents="none" style={st.selectionBorder} />
                    )}
                    <View
                      pointerEvents="none"
                      style={[st.check, order >= 0 && st.checked]}
                    >
                      <Text style={st.checkText}>
                        {order >= 0 ? order + 1 : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={st.empty}>
                  {loading ? (
                    <ActivityIndicator
                      color={p.primary}
                      accessibilityLabel="사진 목록 불러오는 중"
                    />
                  ) : (
                    <>
                      <Icon name="image" size={36} color={p.secondary} />
                      <Text style={[s.strong, { textAlign: "center" }]}>
                        {granted
                          ? "선택할 사진이 없어요"
                          : "사진 접근을 허용해 주세요"}
                      </Text>
                      <Text style={[s.small, { textAlign: "center" }]}>
                        {Platform.OS === "web"
                          ? "위 버튼으로 기기의 사진을 여러 장 가져올 수 있어요."
                          : granted
                            ? "기기에 저장된 사진을 여기에 표시해요."
                            : "채팅에 보낼 사진을 목록에서 선택할 수 있어요."}
                      </Text>
                      {!granted && (
                        <Button
                          title={
                            permission?.canAskAgain
                              ? "사진 접근 허용"
                              : "기기 설정 열기"
                          }
                          secondary
                          onPress={() => {
                            if (permission?.canAskAgain) void load(true, true);
                            else
                              void Linking.openSettings().catch(() =>
                                setError(
                                  "기기 설정에서 사진 접근을 허용해 주세요.",
                                ),
                              );
                          }}
                        />
                      )}
                    </>
                  )}
                </View>
              }
              ListFooterComponent={
                photos.length && loading ? (
                  <ActivityIndicator
                    style={{ padding: 12 }}
                    color={p.primary}
                    accessibilityLabel="이전 사진 불러오는 중"
                  />
                ) : null
              }
            />
          </View>
          {!!error && (
            <View style={st.notice}>
              <Text
                accessibilityRole="alert"
                style={[s.small, { color: p.red }]}
              >
                {error}
              </Text>
              {!sending && Platform.OS !== "web" && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load(true)}
                  style={st.accessButton}
                >
                  <Text style={st.link}>목록 다시 불러오기</Text>
                </Pressable>
              )}
            </View>
          )}
          {!!selected.length && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={st.selectedRail}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            >
              {selected.map(({ photo }, index) => (
                <Pressable
                  key={photo.id}
                  accessibilityRole="button"
                  accessibilityLabel={`선택한 사진 ${index + 1} 제거`}
                  disabled={sending}
                  onPress={() => toggle(photo)}
                  style={st.selectedPhoto}
                >
                  <Image
                    source={{ uri: photo.uri }}
                    style={st.thumbnail}
                    contentFit="cover"
                  />
                  <View style={st.remove}>
                    <Icon name="close" size={12} color={p.white} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {sending && (
            <View style={st.progressTrack}>
              <View
                style={[
                  st.progress,
                  {
                    width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          )}
          <View style={st.footer}>
            <Text accessibilityLiveRegion="polite" style={s.strong}>
              {sending
                ? `${progress.sent} / ${progress.total}장 전송 중`
                : `${selected.length}장 선택`}
            </Text>
            <Button
              title={
                sending
                  ? "전송 중"
                  : `${selected.length ? `${selected.length}장 ` : ""}전송`
              }
              loading={sending}
              disabled={
                !selected.length || !!trip?.archived || chat.busy || loading
              }
              onPress={() => void send()}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(16,30,48,0.38)",
  },
  sheet: {
    width: "100%",
    maxWidth: 640,
    backgroundColor: p.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: p.border,
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  notice: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  limited: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 8,
    backgroundColor: p.blueSoft,
  },
  accessButton: { padding: 12 },
  link: { color: p.primary, fontSize: 13, fontWeight: "700" },
  grid: { flex: 1, minHeight: 0 },
  cell: { backgroundColor: p.bg },
  thumbnail: { width: "100%", height: "100%" },
  selectionBorder: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderWidth: 3,
    borderColor: p.primary,
    backgroundColor: "rgba(19,119,232,0.12)",
  },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: p.white,
    backgroundColor: "rgba(16,30,48,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: p.primary },
  checkText: { color: p.white, fontSize: 12, fontWeight: "800" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  selectedRail: { flexGrow: 0, flexShrink: 0, height: 72, paddingVertical: 10 },
  selectedPhoto: { width: 52, height: 52, borderRadius: 8, overflow: "hidden" },
  remove: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "rgba(16,30,48,0.7)",
    padding: 3,
    borderBottomLeftRadius: 6,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: p.border,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  progressTrack: { height: 3, backgroundColor: p.blueSoft },
  progress: { height: 3, backgroundColor: p.primary },
});
