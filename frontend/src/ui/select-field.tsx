import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentProps } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Icon, type IconName } from "./components";
import { palette as p } from "./theme";

export interface SelectOption {
  value: string | null;
  label: string;
  description?: string;
}

export function SelectField({
  title,
  value,
  options,
  onChange,
  icon,
  placeholder = "선택해 주세요",
  searchPlaceholder = "이름이나 내용으로 검색",
  emptyText = "선택할 항목이 없어요.",
  hint,
  disabled = false,
  compact = false,
}: {
  title: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string | null) => void;
  icon?: IconName;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  hint?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const trigger = useRef<View>(null);
  const dialog = useRef<View>(null);
  const search = useRef<TextInput>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`
        .toLocaleLowerCase()
        .includes(text),
    );
  }, [options, query]);

  const close = useCallback(() => {
    search.current?.blur();
    setVisible(false);
    setQuery("");
    if (Platform.OS === "web")
      requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  const open = useCallback(() => {
    if (disabled) return;
    Keyboard.dismiss();
    setQuery("");
    setVisible(true);
  }, [disabled]);
  const choose = (next: string | null) => {
    if (disabled) return;
    // Re-selecting null must still confirm an intentional "no place" choice.
    onChange(next);
    close();
  };

  useEffect(() => {
    if (disabled && visible) close();
  }, [disabled, visible, close]);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const frame = requestAnimationFrame(() => search.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "Tab") {
        const element = dialog.current as unknown as HTMLElement | null;
        const targets = Array.from(
          element?.querySelectorAll<HTMLElement>(
            'input, button, [tabindex="0"]',
          ) ?? [],
        ).filter(
          (target) =>
            target.getAttribute("disabled") == null &&
            target.getAttribute("aria-disabled") !== "true" &&
            target.offsetParent !== null,
        );
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [visible, close]);

  const webTriggerProps =
    Platform.OS === "web"
      ? {
          "aria-haspopup": "listbox" as const,
          "aria-controls": visible ? listId : undefined,
          onKeyDown: (event: { key: string; preventDefault(): void }) => {
            if (["Enter", " ", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
              open();
            }
          },
        }
      : {};

  return (
    <View style={[st.field, compact && st.compactField]}>
      {!compact && <Text style={st.label}>{title}</Text>}
      <Pressable
        ref={trigger}
        {...webTriggerProps}
        accessibilityRole="combobox"
        accessibilityLabel={`${title}: ${selected?.label ?? placeholder}`}
        accessibilityHint={hint}
        accessibilityState={{ disabled, expanded: visible }}
        aria-expanded={visible}
        disabled={disabled}
        onPress={open}
        style={({ pressed }) => [
          st.trigger,
          compact && st.compactTrigger,
          visible && { borderColor: p.primary },
          (disabled || pressed) && { opacity: 0.6 },
        ]}
      >
        {icon && (
          <View style={[st.icon, compact && st.compactIcon]}>
            <Icon name={icon} color={p.primary} size={20} />
          </View>
        )}
        <View style={st.text}>
          <Text
            numberOfLines={compact ? 1 : 2}
            style={[st.value, !selected && { color: p.secondary }]}
          >
            {selected?.label ?? placeholder}
          </Text>
          {!compact && !!selected?.description && (
            <Text numberOfLines={2} style={st.description}>
              {selected.description}
            </Text>
          )}
        </View>
        <Icon name="down" color={p.secondary} size={19} />
      </Pressable>
      {!!hint && <Text style={st.hint}>{hint}</Text>}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={st.overlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessible={false}
            aria-hidden
            tabIndex={-1}
          />
          <View
            ref={dialog}
            role="dialog"
            aria-modal
            accessibilityViewIsModal
            accessibilityLabel={`${title} ${title.endsWith("선택") ? "목록" : "선택"}`}
            style={[st.dialog, { maxHeight: Math.min(640, height - 40) }]}
          >
            <View style={st.header}>
              <View style={st.text}>
                <Text accessibilityRole="header" style={st.heading}>
                  {title}
                </Text>
                <Text style={st.description}>원하는 항목을 선택해 주세요</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="선택창 닫기"
                onPress={close}
                style={st.close}
              >
                <Icon name="close" size={20} color={p.secondary} />
              </Pressable>
            </View>
            <View style={[st.search, searchFocused && st.focusedSearch]}>
              <Icon name="search" size={18} color={p.secondary} />
              <TextInput
                ref={search}
                accessibilityLabel={`${title} 검색`}
                value={query}
                onChangeText={setQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={searchPlaceholder}
                placeholderTextColor={p.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={st.searchInput}
              />
            </View>
            <FlatList
              nativeID={listId}
              role={
                Platform.OS === "web"
                  ? ("listbox" as ComponentProps<typeof View>["role"])
                  : "list"
              }
              accessibilityLabel={`${title} 항목`}
              data={filtered}
              extraData={value}
              keyExtractor={(option) => JSON.stringify(option.value)}
              keyboardShouldPersistTaps="handled"
              style={st.list}
              contentContainerStyle={st.listContent}
              initialNumToRender={12}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    role="option"
                    {...(Platform.OS === "web"
                      ? {
                          onKeyDown: (event: {
                            key: string;
                            preventDefault(): void;
                          }) => {
                            if (event.key === " ") {
                              event.preventDefault();
                              choose(item.value);
                            }
                          },
                        }
                      : {})}
                    accessibilityLabel={`${item.label}${item.description ? `, ${item.description}` : ""}`}
                    accessibilityState={{ selected: active, disabled }}
                    aria-selected={active}
                    disabled={disabled}
                    onPress={() => choose(item.value)}
                    style={({ pressed }) => [
                      st.option,
                      active && st.activeOption,
                      pressed && { opacity: 0.65 },
                    ]}
                  >
                    <View style={st.text}>
                      <Text
                        style={[st.optionLabel, active && { color: p.primary }]}
                      >
                        {item.label}
                      </Text>
                      {!!item.description && (
                        <Text style={st.description}>{item.description}</Text>
                      )}
                    </View>
                    <View style={[st.radio, active && st.activeRadio]}>
                      {active && (
                        <Icon name="check" color={p.white} size={13} />
                      )}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={st.empty}>
                  <Icon name="search" size={24} color={p.secondary} />
                  <Text accessibilityLiveRegion="polite" style={st.emptyText}>
                    {query.trim()
                      ? "검색 결과가 없어요. 검색어를 바꿔 보세요."
                      : emptyText}
                  </Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  field: { gap: 8, marginBottom: 18 },
  compactField: { gap: 0, marginBottom: 0 },
  label: { color: p.ink, fontSize: 12, fontWeight: "600" },
  trigger: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compactTrigger: {
    minHeight: 48,
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.blueSoft,
  },
  compactIcon: { width: 28, height: 28, borderRadius: 8 },
  text: { flex: 1, minWidth: 0 },
  value: { color: p.ink, fontSize: 15, fontWeight: "600", lineHeight: 21 },
  description: {
    color: p.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  hint: { color: p.secondary, fontSize: 11, lineHeight: 17 },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#142D4C80",
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    flexShrink: 1,
    backgroundColor: p.white,
    borderRadius: 24,
    padding: 18,
    gap: 14,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: { color: p.ink, fontSize: 20, fontWeight: "700", lineHeight: 27 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.bg,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 13,
    backgroundColor: p.bg,
    borderWidth: 1,
    borderColor: p.border,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    paddingVertical: 12,
    color: p.ink,
    fontSize: 14,
    ...(Platform.OS === "web"
      ? { outlineStyle: "solid" as const, outlineWidth: 0 }
      : {}),
  },
  focusedSearch: { borderColor: p.primary, backgroundColor: p.white },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  listContent: { gap: 7, paddingBottom: 2 },
  option: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  activeOption: { backgroundColor: p.blueSoft, borderColor: "#C6DFFF" },
  optionLabel: {
    color: p.ink,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD7E5",
    alignItems: "center",
    justifyContent: "center",
  },
  activeRadio: { borderColor: p.primary, backgroundColor: p.primary },
  empty: {
    paddingVertical: 30,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    color: p.secondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
});
