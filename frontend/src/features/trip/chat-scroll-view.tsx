import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { useChatRoom } from "./chat-context";
import { ChatScrollPosition } from "./chat-scroll-position";

export function ChatScrollView(props: ScrollViewProps) {
  const { viewKey } = useChatRoom();
  return <ChatViewport key={viewKey} {...props} />;
}

function ChatViewport(props: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const position = useRef(new ChatScrollPosition());
  const frame = useRef<number | null>(null);
  const focused = useRef(false);
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
      return () => {
        focused.current = false;
        cancelScroll();
      };
    }, [cancelScroll, scrollToLatest]),
  );

  return (
    <ScrollView
      {...props}
      ref={scroll}
      accessibilityLabel="채팅 메시지"
      onLayout={({ nativeEvent }) => {
        position.current.layoutChanged(nativeEvent.layout.height);
        scrollToLatest();
      }}
      onContentSizeChange={(_width, height) => {
        position.current.contentChanged(height);
        scrollToLatest();
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
      }}
    />
  );
}
