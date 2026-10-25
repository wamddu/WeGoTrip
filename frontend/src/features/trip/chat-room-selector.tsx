import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Icon } from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { useChatRoom } from "./chat-context";
import { useTrip } from "./trip-context";

export function ChatRoomSelector({ onViewChange }: { onViewChange(): void }) {
  const { userApi, trip } = useTrip();
  const chat = useChatRoom();
  const [open, setOpen] = useState(false);
  const [anchorHeight, setAnchorHeight] = useState(57);
  const [triggerWidth, setTriggerWidth] = useState(220);
  const [availableHeight, setAvailableHeight] = useState(360);
  const trigger = useRef<View>(null);
  const items = useRef<(View | null)[]>([]);
  const listId = useId();
  const options = [
    { id: null, name: "전체 채팅", count: trip?.memberIds.length ?? 0 },
    ...chat.parties.map((party) => ({
      id: party.id,
      name: party.name,
      count: party.memberIds.length,
    })),
  ];
  const selectedIndex = Math.max(
    0,
    options.findIndex((item) => item.id === chat.partyId),
  );
  const selected = options[selectedIndex];
  const focusIndex = useRef(0);

  function close() {
    setOpen(false);
    if (Platform.OS === "web") trigger.current?.focus();
  }

  useEffect(() => {
    if (!open || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setOpen(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [open]);

  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    focusIndex.current = selectedIndex;
    const frame = requestAnimationFrame(() =>
      items.current[selectedIndex]?.focus(),
    );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      } else if (event.key === "Tab") {
        setOpen(false);
        trigger.current?.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const count = options.length;
        focusIndex.current =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : (focusIndex.current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  count) %
                count;
        items.current[focusIndex.current]?.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown, true);
    };
  }, [open, selectedIndex, options.length]);

  if (!userApi) return null;
  return (
    <>
      <View
        style={st.selector}
        onLayout={(event) => setAnchorHeight(event.nativeEvent.layout.height)}
      >
        <Pressable
          ref={trigger}
          onLayout={(event) => setTriggerWidth(event.nativeEvent.layout.width)}
          accessibilityRole="combobox"
          accessibilityLabel={`채팅방: ${selected.name}`}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          onPress={() => {
            Keyboard.dismiss();
            setOpen((current) => !current);
          }}
          style={({ pressed }) => [
            st.trigger,
            (open || pressed) && st.activeTrigger,
          ]}
        >
          <View style={st.icon}>
            <Icon name="chat" color={p.primary} size={20} />
          </View>
          <Text numberOfLines={1} style={st.name}>
            {selected.name}
          </Text>
          <View style={open && { transform: [{ rotate: "180deg" }] }}>
            <Icon name="down" size={19} color={p.secondary} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="이미지 채팅만 보기"
          accessibilityState={{ checked: chat.imagesOnly }}
          aria-checked={chat.imagesOnly}
          onPress={() => {
            setOpen(false);
            onViewChange();
            chat.setImagesOnly(!chat.imagesOnly);
          }}
          style={({ pressed }) => [
            st.imageFilter,
            chat.imagesOnly && st.activeFilter,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon
            name="image"
            size={19}
            color={chat.imagesOnly ? p.primary : p.secondary}
          />
          <Text
            style={[st.filterLabel, chat.imagesOnly && { color: p.primary }]}
          >
            이미지
          </Text>
        </Pressable>
      </View>
      {open && (
        // A sibling overlay spans the conversation's parent, keeping native touch
        // targets inside their parent's bounds without taking layout height.
        <View
          pointerEvents="box-none"
          style={st.layer}
          onLayout={(event) =>
            setAvailableHeight(event.nativeEvent.layout.height)
          }
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { top: anchorHeight }]}
            onPress={close}
            accessible={false}
            aria-hidden
            tabIndex={-1}
          />
          <View
            style={[
              st.panel,
              {
                top: anchorHeight + 2,
                width: triggerWidth,
                maxHeight: Math.min(
                  288,
                  Math.max(48, availableHeight - anchorHeight - 10),
                ),
              },
            ]}
          >
            <ScrollView
              nativeID={listId}
              role={
                Platform.OS === "web"
                  ? ("listbox" as ComponentProps<typeof View>["role"])
                  : "list"
              }
              accessibilityLabel="채팅방 목록"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={options.length > 5}
              style={st.list}
              contentContainerStyle={st.listContent}
            >
              {options.map((option, index) => {
                const active = option.id === chat.partyId;
                return (
                  <Pressable
                    key={option.id ?? "all"}
                    ref={(item) => {
                      items.current[index] = item;
                    }}
                    role={Platform.OS === "web" ? "option" : "button"}
                    accessibilityLabel={`${option.name}, ${option.count}명`}
                    accessibilityState={{ selected: active }}
                    aria-selected={active}
                    onPress={() => {
                      if (!active) {
                        onViewChange();
                        chat.setPartyId(option.id);
                      }
                      close();
                    }}
                    style={({ pressed }) => [
                      st.option,
                      (active || pressed) && st.activeOption,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[st.name, active && { color: p.primary }]}
                    >
                      {option.name}
                    </Text>
                    <Text style={st.count}>{option.count}명</Text>
                    <View style={st.check}>
                      {active && (
                        <Icon name="check" color={p.primary} size={18} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const st = StyleSheet.create({
  selector: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: p.white,
    borderBottomWidth: 1,
    borderBottomColor: p.border,
  },
  trigger: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeTrigger: { borderColor: p.primary },
  imageFilter: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: p.border,
  },
  activeFilter: { borderColor: p.primary, backgroundColor: p.blueSoft },
  filterLabel: { fontSize: 13, fontWeight: "600", color: p.secondary },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.blueSoft,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: p.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  layer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
  },
  panel: {
    position: "absolute",
    left: 16,
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 12,
    shadowColor: p.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 0, borderRadius: 12 },
  listContent: { padding: 4 },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeOption: { backgroundColor: p.blueSoft },
  count: { color: p.secondary, fontSize: 12 },
  check: { width: 18 },
});
