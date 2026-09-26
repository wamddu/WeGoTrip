import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName, styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";

export function FriendTabs<T extends string>({
  items,
  value,
  onChange,
  disabled,
}: {
  items: readonly { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
  disabled?: boolean;
}) {
  return (
    <View style={f.tabs}>
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(item.value)}
          style={({ pressed }) => [
            f.tab,
            value === item.value && f.activeTab,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[f.tabLabel, value === item.value && { color: p.primary }]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function FriendEmpty({
  icon = "users",
  title,
  children,
}: PropsWithChildren<{ icon?: IconName; title: string }>) {
  return (
    <View style={f.empty}>
      <View style={f.emptyIcon}>
        <Icon name={icon} size={26} color={p.primary} />
      </View>
      <Text style={s.strong}>{title}</Text>
      <Text style={[s.body, { textAlign: "center" }]}>{children}</Text>
    </View>
  );
}

export const f = StyleSheet.create({
  hero: {
    backgroundColor: p.blueSoft,
    padding: 24,
    borderRadius: 24,
    gap: 12,
    marginBottom: 22,
    overflow: "hidden",
  },
  eyebrow: {
    color: p.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heroTitle: {
    fontSize: 27,
    lineHeight: 37,
    fontWeight: "800",
    color: p.ink,
    letterSpacing: -1,
  },
  heroIcon: {
    position: "absolute",
    right: -16,
    top: -16,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#DDEBFF",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.65,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#E9EFF6",
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: p.white,
    boxShadow: "0 2px 6px rgba(29, 48, 73, 0.06)",
  },
  tabLabel: { fontSize: 14, fontWeight: "700", color: p.secondary },
  panel: {
    backgroundColor: p.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: p.border,
    padding: 18,
    gap: 14,
    marginBottom: 20,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: p.bg,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingVertical: 12,
    fontSize: 15,
    color: p.ink,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  list: {
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 20,
    overflow: "hidden",
  },
  person: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  divider: { borderTopWidth: 1, borderTopColor: p.border },
  quietAction: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 18,
    gap: 10,
    backgroundColor: p.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: p.border,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: p.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  feedback: {
    backgroundColor: p.mintSoft,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  request: {
    backgroundColor: p.white,
    padding: 18,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 20,
    gap: 16,
    marginTop: 12,
  },
  actions: { flexDirection: "row", gap: 10 },
});
