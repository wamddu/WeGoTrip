import { SymbolView } from "expo-symbols";
import type { ComponentProps, PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { User } from "../domain/models";
import { palette as p } from "./theme";

const names = {
  home: ["house", "home"],
  trips: ["suitcase.rolling", "luggage"],
  plus: ["plus", "add"],
  bell: ["bell", "notifications"],
  user: ["person.crop.circle", "account_circle"],
  back: ["chevron.left", "chevron_left"],
  arrow: ["arrow.right", "arrow_forward"],
  down: ["chevron.down", "expand_more"],
  close: ["xmark", "close"],
  calendar: ["calendar", "calendar_month"],
  pin: ["mappin.and.ellipse", "location_on"],
  wallet: ["creditcard", "account_balance_wallet"],
  check: ["checkmark", "check"],
  checklist: ["checklist", "checklist"],
  notice: ["megaphone", "campaign"],
  chat: ["bubble.left.and.bubble.right", "forum"],
  users: ["person.2", "group"],
  settings: ["slider.horizontal.3", "tune"],
  search: ["magnifyingglass", "search"],
  edit: ["square.and.pencil", "edit"],
  trash: ["trash", "delete"],
  plane: ["airplane", "flight"],
  link: ["link", "link"],
  send: ["arrow.up", "arrow_upward"],
  clock: ["clock", "schedule"],
  map: ["map", "map"],
  logout: ["rectangle.portrait.and.arrow.right", "logout"],
} as const;
export type IconName = keyof typeof names;
export function Icon({
  name,
  size = 22,
  color = p.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const [ios, material] = names[name];
  return (
    <View accessible={false} aria-hidden>
      <SymbolView
        name={
          { ios, android: material, web: material } as ComponentProps<
            typeof SymbolView
          >["name"]
        }
        size={size}
        tintColor={color}
      />
    </View>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  soft = false,
}: {
  name: IconName;
  label: string;
  onPress(): void;
  soft?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.iconButton, soft && { backgroundColor: p.blueSoft }]}
    >
      <Icon name={name} color={soft ? p.primary : p.ink} />
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  danger,
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress(): void;
  secondary?: boolean;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const color = danger ? p.red : secondary ? p.primary : p.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        danger && { backgroundColor: p.coralSoft },
        (disabled || loading || pressed) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        icon && <Icon name={icon} size={19} color={color} />
      )}
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}
export function Chip({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: active }}
      aria-selected={active}
      onPress={onPress}
      style={[styles.chip, active && styles.activeChip]}
    >
      <Text
        style={[
          styles.chipText,
          active && { color: p.primary, fontWeight: "700" },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  title,
  ...props
}: ComponentProps<typeof TextInput> & { title: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{title}</Text>
      <TextInput
        accessibilityLabel={title}
        placeholderTextColor="#9BAABD"
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 100, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?(): void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={styles.textAction}
        >
          <Text style={styles.link}>{action}</Text>
          <Icon name="arrow" size={15} color={p.primary} />
        </Pressable>
      )}
    </View>
  );
}
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
export function Badge({
  children,
  color = p.primary,
  background = p.blueSoft,
}: PropsWithChildren<{ color?: string; background?: string }>) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={{ fontSize: 11, color, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}
export function Avatar({ user, size = 32 }: { user?: User; size?: number }) {
  return (
    <View
      accessibilityLabel={user?.name}
      style={{
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: user?.color ?? p.blueSoft,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: p.white,
      }}
    >
      <Text style={{ color: p.ink, fontSize: size / 3, fontWeight: "700" }}>
        {user?.name.slice(0, 1) ?? "?"}
      </Text>
    </View>
  );
}
export function People({ users }: { users: User[] }) {
  return (
    <View style={styles.row}>
      {users.slice(0, 4).map((user, i) => (
        <View key={user.id} style={{ marginLeft: i ? -14 : 0 }}>
          <Avatar user={user} />
        </View>
      ))}
      {users.length > 4 && (
        <Text style={styles.small}>+{users.length - 4}</Text>
      )}
    </View>
  );
}
export function Empty({
  title,
  description,
  action,
  onPress,
}: {
  title: string;
  description: string;
  action?: string;
  onPress?(): void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="plane" color={p.primary} size={27} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={[styles.body, { textAlign: "center" }]}>{description}</Text>
      {action && onPress && <Button title={action} onPress={onPress} />}
    </View>
  );
}
export function ErrorMessage({ message }: { message?: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  ) : null;
}
export function Busy() {
  return (
    <View
      style={{
        flex: 1,
        padding: 60,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: p.bg,
      }}
    >
      <ActivityIndicator size="large" color={p.primary} />
      <Text style={[styles.body, { marginTop: 16 }]}>
        여행을 불러오고 있어요
      </Text>
    </View>
  );
}
export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.9,
    lineHeight: 35,
    color: p.ink,
  },
  body: { fontSize: 14, lineHeight: 23, color: p.secondary },
  small: { fontSize: 12, lineHeight: 19, color: p.secondary },
  strong: { fontSize: 15, lineHeight: 23, color: p.ink, fontWeight: "700" },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 19,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: p.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontSize: 15, fontWeight: "700" },
  secondaryButton: { backgroundColor: p.blueSoft },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.border,
  },
  activeChip: { backgroundColor: p.blueSoft, borderColor: "#AFD0FE" },
  chipText: { fontSize: 12, color: p.secondary },
  field: { gap: 8, marginBottom: 18 },
  label: { color: p.ink, fontSize: 12, fontWeight: "600" },
  input: {
    backgroundColor: p.white,
    minHeight: 51,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 13,
    padding: 14,
    fontSize: 16,
    color: p.ink,
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 26,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    color: p.ink,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  textAction: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  link: { color: p.primary, fontSize: 12, fontWeight: "600" },
  card: {
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.border,
    padding: 18,
    borderRadius: 19,
    gap: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    alignSelf: "flex-start",
  },
  empty: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 12,
    alignItems: "center",
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.blueSoft,
  },
  error: {
    color: p.red,
    backgroundColor: p.coralSoft,
    padding: 14,
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 21,
    marginVertical: 10,
  },
  divider: { height: 1, backgroundColor: p.border, marginVertical: 14 },
});
