import type { ComponentProps, PropsWithChildren } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export const colors = { ink: '#193E37', muted: '#71837D', green: '#176A53', pale: '#EAF3EA', paper: '#FCFCF8', line: '#E6EBE5', orange: '#EFB45F', white: '#FFFFFF', red: '#B24435' };
const icons = {
  home: { ios: 'house', android: 'home', web: 'home' }, calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  map: { ios: 'map', android: 'map', web: 'map' }, wallet: { ios: 'creditcard', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'chat_bubble', web: 'chat_bubble' }, users: { ios: 'person.2', android: 'group', web: 'group' },
  plus: { ios: 'plus', android: 'add', web: 'add' }, arrow: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }, close: { ios: 'xmark', android: 'close', web: 'close' },
  check: { ios: 'checkmark', android: 'check', web: 'check' }, bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  pin: { ios: 'mappin', android: 'location_on', web: 'location_on' }, send: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
} satisfies Record<string, ComponentProps<typeof SymbolView>['name']>;
export type IconName = keyof typeof icons;
export function Icon({ name, color = colors.ink, size = 22 }: { name: IconName; color?: string; size?: number }) {
  return <SymbolView name={icons[name]} tintColor={color} size={size} />;
}
export function Label({ children }: PropsWithChildren) { return <Text style={s.label}>{children}</Text>; }
export function Heading({ children, action, onPress }: PropsWithChildren<{ action?: string; onPress?: () => void }>) {
  return <View style={s.heading}><Text style={s.h2}>{children}</Text>{action && <Pressable accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.link}>{action} →</Text></Pressable>}</View>;
}
export function Button({ label, onPress, secondary = false, icon }: { label: string; onPress: () => void; secondary?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && { opacity: 0.7 }]}>{icon && <Icon name={icon} color={secondary ? colors.green : colors.white} size={19} />}<Text style={[s.buttonText, secondary && { color: colors.green }]}>{label}</Text></Pressable>;
}
export function IconButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.iconButton}><Icon name={name} /></Pressable>;
}
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.chipSelected]}><Text style={[s.chipText, selected && { color: colors.white }]}>{label}</Text></Pressable>;
}
export function Field({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={s.field}><Label>{label}</Label><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[s.input, props.multiline && { minHeight: 94, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return <View style={s.empty}><Text style={s.h2}>{title}</Text><Text style={s.body}>{detail}</Text></View>;
}
export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  h2: { fontSize: 19, fontWeight: '700', color: colors.ink }, body: { fontSize: 14, lineHeight: 23, color: colors.muted },
  label: { fontSize: 12, lineHeight: 20, color: colors.muted }, link: { fontSize: 13, fontWeight: '600', color: colors.green },
  heading: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  action: { minHeight: 44, justifyContent: 'center' },
  button: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  secondary: { backgroundColor: colors.pale }, buttonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 42, paddingHorizontal: 15, paddingVertical: 11, backgroundColor: colors.pale, borderRadius: 22, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.green }, chipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  field: { gap: 6, marginBottom: 18 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 12, padding: 14, fontSize: 16, color: colors.ink },
  empty: { padding: 26, gap: 10, alignItems: 'center', backgroundColor: colors.pale, borderRadius: 20, marginVertical: 16 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 20, padding: 18 },
});
