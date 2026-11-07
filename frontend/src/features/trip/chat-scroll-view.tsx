import { useFocusEffect } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  type View,
} from "react-native";
import { useChatRoom } from "./chat-context";
import { ChatScrollPosition } from "./chat-scroll-position";

type MapObserver = (element: View, load: () => void) => () => void;
const MapViewport = createContext<MapObserver | null>(null);

export function useVisibleChatMap() {
  const ref = useRef<View>(null);
  const observe = useContext(MapViewport);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    if (Platform.OS === "web" && typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      });
      observer.observe(element as unknown as Element);
      return () => observer.disconnect();
    }
    if (observe) return observe(element, () => setVisible(true));
    setVisible(true);
  }, [observe, visible]);
  return [ref, visible] as const;
}

export function ChatScrollView(props: ScrollViewProps) {
  const { viewKey } = useChatRoom();
  return <ChatViewport key={viewKey} {...props} />;
}

function ChatViewport(props: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const position = useRef(new ChatScrollPosition());
  const frame = useRef<number | null>(null);
  const focused = useRef(false);
  const mapWatchers = useRef(new Map<View, () => void>());
  const mapCheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkVisibleMaps = useCallback(() => {
    if (
      !focused.current ||
      !mapWatchers.current.size ||
      mapCheck.current !== null
    )
      return;
    mapCheck.current = setTimeout(() => {
      mapCheck.current = null;
      scroll.current
        ?.getNativeScrollRef()
        ?.measureInWindow((_x, top, _width, height) => {
          if (!focused.current || height <= 0) return;
          for (const [element, load] of mapWatchers.current) {
            element.measureInWindow((_left, y, _w, h) => {
              if (
                focused.current &&
                mapWatchers.current.get(element) === load &&
                h > 0 &&
                y < top + height &&
                y + h > top
              ) {
                mapWatchers.current.delete(element);
                load();
              }
            });
          }
        });
    }, 80);
  }, []);
  const observeMap = useCallback<MapObserver>(
    (element, load) => {
      mapWatchers.current.set(element, load);
      checkVisibleMaps();
      return () => {
        mapWatchers.current.delete(element);
      };
    },
    [checkVisibleMaps],
  );
  const cancelScroll = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const scrollToLatest = useCallback(() => {
    if (!focused.current) return;
    cancelScroll();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (focused.current && position.current.shouldScrollToLatest())
        scroll.current?.scrollToEnd({ animated: false });
    });
  }, [cancelScroll]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      position.current.reset();
      scrollToLatest();
      checkVisibleMaps();
      return () => {
        focused.current = false;
        cancelScroll();
        if (mapCheck.current !== null) clearTimeout(mapCheck.current);
        mapCheck.current = null;
      };
    }, [cancelScroll, scrollToLatest, checkVisibleMaps]),
  );

  return (
    <MapViewport.Provider value={observeMap}>
      <ScrollView
        {...props}
        ref={scroll}
        accessibilityLabel="채팅 메시지"
        onLayout={({ nativeEvent }) => {
          position.current.layoutChanged(nativeEvent.layout.height);
          scrollToLatest();
          checkVisibleMaps();
        }}
        onContentSizeChange={(_width, height) => {
          position.current.contentChanged(height);
          scrollToLatest();
          checkVisibleMaps();
        }}
        onScrollBeginDrag={() => {
          cancelScroll();
          position.current.beginDrag();
        }}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          position.current.scrolled({
            contentHeight: nativeEvent.contentSize.height,
            viewportHeight: nativeEvent.layoutMeasurement.height,
            offsetY: nativeEvent.contentOffset.y,
          });
          checkVisibleMaps();
        }}
      />
    </MapViewport.Provider>
  );
}
