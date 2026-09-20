import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { palette as p } from "../../ui/theme";
import { styles as s } from "../../ui/components";
import { useTrip } from "./trip-context";

export function SchedulePager({
  children,
}: {
  children: (partyId: string | null, active: boolean) => ReactNode;
}) {
  const { trip, partyId, setPartyId } = useTrip();
  const pages = [{ id: null, name: "전체" }, ...trip!.parties];
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === partyId),
  );
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const offset = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);
  useEffect(() => {
    offset.stopAnimation();
    offset.setValue(-index * width);
    animating.current = false;
  }, [index, width, offset]);

  function move(next: number) {
    const target = Math.max(0, Math.min(pages.length - 1, next));
    animating.current = true;
    Animated.timing(offset, {
      toValue: -target * width,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      animating.current = false;
      if (finished) setPartyId(pages[target].id);
    });
  }
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          !animating.current &&
          width > 0 &&
          pages.length > 1 &&
          g.numberActiveTouches === 1 &&
          Math.abs(g.dx) > 12 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => {
          const atEdge =
            (index === 0 && g.dx > 0) ||
            (index === pages.length - 1 && g.dx < 0);
          offset.setValue(
            -index * width +
              (atEdge ? g.dx * 0.2 : Math.max(-width, Math.min(width, g.dx))),
          );
        },
        onPanResponderRelease: (_, g) => {
          const advance =
            Math.abs(g.dx) > Math.min(80, width * 0.22) ||
            (Math.abs(g.dx) > 20 && Math.abs(g.vx) > 0.5);
          move(index + (advance ? (g.dx < 0 ? 1 : -1) : 0));
        },
        onPanResponderTerminate: () => move(index),
        onPanResponderTerminationRequest: () => false,
      }),
    [index, width, pages.length, partyId, trip!.parties, setPartyId],
  );

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      {...pan.panHandlers}
      style={st.root}
    >
      <View style={st.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 팀 일정"
          disabled={index === 0}
          onPress={() => move(index - 1)}
          style={[st.arrow, index === 0 && st.disabled]}
        >
          <Text style={st.arrowText}>‹</Text>
        </Pressable>
        <View style={st.title} accessibilityLiveRegion="polite">
          <Text style={s.strong}>{pages[index].name}</Text>
          <View
            style={st.dots}
            accessibilityLabel={`${pages.length}개 중 ${index + 1}번째 화면`}
          >
            {pages.map((page, i) => (
              <View
                key={page.id ?? "all"}
                style={[st.dot, i === index && st.activeDot]}
              />
            ))}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다음 팀 일정"
          disabled={index === pages.length - 1}
          onPress={() => move(index + 1)}
          style={[st.arrow, index === pages.length - 1 && st.disabled]}
        >
          <Text style={st.arrowText}>›</Text>
        </Pressable>
      </View>
      {pages.length > 1 && (
        <Text style={st.hint}>좌우로 밀어 팀별 일정을 확인하세요</Text>
      )}
      {width > 0 && (
        <View style={{ overflow: "hidden", height: heights[partyId ?? "all"] }}>
          <Animated.View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              width: width * pages.length,
              transform: [{ translateX: offset }],
            }}
          >
            {pages.map((page, i) => (
              <View
                key={page.id ?? "all"}
                style={{ width }}
                pointerEvents={i === index ? "auto" : "none"}
                accessibilityElementsHidden={i !== index}
                importantForAccessibility={
                  i === index ? "auto" : "no-hide-descendants"
                }
                aria-hidden={i !== index}
              >
                <View
                  onLayout={(event) => {
                    const height = event.nativeEvent.layout.height;
                    setHeights((current) =>
                      current[page.id ?? "all"] === height
                        ? current
                        : { ...current, [page.id ?? "all"]: height },
                    );
                  }}
                >
                  {children(page.id, i === index)}
                </View>
              </View>
            ))}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: {
    minWidth: 0,
    ...(Platform.OS === "web" ? { touchAction: "pan-y" as const } : {}),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  title: { flex: 1, alignItems: "center", gap: 10 },
  arrow: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 30, color: p.primary },
  disabled: { opacity: 0.2 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: p.border },
  activeDot: { width: 18, backgroundColor: p.primary },
  hint: {
    fontSize: 11,
    color: p.secondary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 6,
  },
});
