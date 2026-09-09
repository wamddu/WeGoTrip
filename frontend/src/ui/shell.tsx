import { router, usePathname } from "expo-router";
import { useState, type PropsWithChildren } from "react";
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTravel } from "../state/travel-provider";
import { Button, Icon, IconButton, styles as s } from "./components";
import { palette as p } from "./theme";

export function Frame({ children }: PropsWithChildren) {
  return (
    <View style={st.outer}>
      <SafeAreaView style={st.frame} edges={["top", "bottom"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}
export function Page({
  children,
  title,
  subtitle,
  back,
  right,
  footer,
  refresh = false,
  navigation = true,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  refresh?: boolean;
  navigation?: boolean;
}>) {
  const state = useTravel();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <Frame>
      {title && (
        <View style={st.header}>
          {back && (
            <IconButton
              name="back"
              label="뒤로"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/home")
              }
            />
          )}
          <View style={s.flex}>
            <Text style={st.headerTitle}>{title}</Text>
            {subtitle && <Text style={s.small}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.content}
          refreshControl={
            refresh ? (
              <RefreshControl
                refreshing={refreshing}
                tintColor={p.primary}
                onRefresh={async () => {
                  setRefreshing(true);
                  await state.refresh();
                  setRefreshing(false);
                }}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
      {navigation && <BottomBar />}
    </Frame>
  );
}
export function BottomBar({ add }: { add?: () => void }) {
  const path = usePathname();
  const { data } = useTravel();
  const unread = data?.notifications.filter((n) => !n.read).length ?? 0;
  return (
    <View style={st.bottom}>
      {(
        [
          ["home", "홈", "/home"],
          ["trips", "내 여행", "/trips"],
          ["plus", "만들기", ""],
          ["bell", "알림", "/notifications"],
          ["user", "내 정보", "/profile"],
        ] as const
      ).map(([icon, title, href]) => {
        const active =
          href === path || (href === "/trips" && path.startsWith("/trip/"));
        return (
          <Pressable
            key={title}
            accessibilityRole="button"
            accessibilityLabel={title === "만들기" ? "새로 만들기" : title}
            onPress={() =>
              href
                ? router.navigate(href)
                : add
                  ? add()
                  : router.push("/trip/new")
            }
            style={st.navItem}
          >
            <View style={[st.navIcon, icon === "plus" && st.add]}>
              <Icon
                name={icon}
                color={
                  icon === "plus" ? p.white : active ? p.primary : p.secondary
                }
                size={icon === "plus" ? 27 : 22}
              />
              {icon === "bell" && unread > 0 && <View style={st.unread} />}
            </View>
            {icon !== "plus" && (
              <Text
                style={[
                  st.navText,
                  active && { color: p.primary, fontWeight: "700" },
                ]}
              >
                {title}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
export function Confirm({
  visible,
  title,
  description,
  onCancel,
  onConfirm,
  busy = false,
}: {
  visible: boolean;
  title: string;
  description: string;
  onCancel(): void;
  onConfirm(): void;
  busy?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={st.scrim}>
        <View style={st.confirm}>
          <Text style={s.sectionTitle}>{title}</Text>
          <Text style={s.body}>{description}</Text>
          <Button title="확인" danger onPress={onConfirm} loading={busy} />
          <Button title="취소" secondary onPress={onCancel} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}
const st = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#E9F0F8", alignItems: "center" },
  frame: { flex: 1, width: "100%", maxWidth: 500, backgroundColor: p.bg },
  header: {
    flexDirection: "row",
    paddingHorizontal: 19,
    paddingTop: 10,
    paddingBottom: 16,
    alignItems: "center",
    gap: 8,
    backgroundColor: p.white,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: p.ink,
    letterSpacing: -0.5,
  },
  content: { padding: 22, paddingBottom: 32 },
  bottom: {
    height: 73,
    paddingTop: 7,
    paddingHorizontal: 10,
    backgroundColor: p.white,
    borderTopWidth: 1,
    borderTopColor: p.border,
    flexDirection: "row",
    alignItems: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    minHeight: 56,
    justifyContent: "center",
    gap: 3,
  },
  navIcon: { minHeight: 27, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 10, color: p.secondary },
  add: {
    width: 47,
    height: 47,
    borderRadius: 18,
    backgroundColor: p.primary,
    transform: [{ translateY: -3 }],
  },
  unread: {
    position: "absolute",
    top: 0,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: p.coral,
    borderWidth: 1,
    borderColor: p.white,
  },
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#142D4C80",
  },
  confirm: {
    backgroundColor: p.white,
    borderRadius: 24,
    width: "100%",
    maxWidth: 400,
    padding: 24,
    gap: 16,
  },
});
