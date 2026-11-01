import { router, useLocalSearchParams } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrip } from "./trip-context";
import { Frame } from "../../ui/shell";
import {
  Button,
  Empty,
  ErrorMessage,
  IconButton,
  styles as s,
} from "../../ui/components";
import { palette as p } from "../../ui/theme";
import {
  OverviewSection,
  ScheduleSection,
  PlacesSection,
} from "./planning-sections";
import { ExpenseSection } from "./expense-section";
import { ChecklistSection, NoticesSection } from "./collaboration-sections";
import { ChatComposer, ChatRoomSelector, ChatSection } from "./chat-section";
import { ChatRoomProvider } from "./chat-context";
import { ChatScrollView } from "./chat-scroll-view";
import { ReadOnlyNote } from "./shared";
import { tripHref } from "../home/home-screen";
const sections = [
  ["overview", "개요"],
  ["schedule", "일정"],
  ["places", "장소"],
  ["expenses", "정산"],
  ["checklist", "준비물"],
  ["notices", "공지"],
  ["chat", "대화"],
] as const;
export default function TripScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const { trip, error, refresh } = useTrip();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  if (!trip)
    return (
      <Frame>
        <Empty
          title="여행을 찾을 수 없어요"
          description={error || undefined}
          action="내 여행으로"
          onPress={() => router.replace("/trips")}
        />
        <Button
          title="다시 불러오기"
          secondary
          onPress={() => void refresh()}
        />
      </Frame>
    );
  const active = sections.some(([key]) => key === section)
    ? section
    : "overview";
  const content = {
    overview: <OverviewSection />,
    schedule: <ScheduleSection />,
    places: <PlacesSection />,
    expenses: <ExpenseSection />,
    checklist: <ChecklistSection />,
    notices: <NoticesSection />,
    chat: <ChatSection />,
  }[active];
  const ContentScroll = active === "chat" ? ChatScrollView : ScrollView;
  const keyboardBehavior =
    Platform.OS === "ios"
      ? "padding"
      : Platform.OS === "android" && active === "chat"
        ? "height"
        : undefined;
  return (
    <ChatRoomProvider enabled={active === "chat"}>
      <Frame>
        <View style={st.header}>
          <IconButton
            name="back"
            label="여행 목록으로"
            onPress={() => router.replace("/trips")}
          />
          <View style={s.flex}>
            <Text style={s.strong} numberOfLines={1}>
              {trip.title}
            </Text>
            <Text style={s.small}>
              {trip.destination} · {trip.memberIds.length}명
            </Text>
          </View>
          <IconButton
            name="users"
            label="멤버와 여행 설정"
            soft
            onPress={() => router.push(`/trip/${trip.id}/manage`)}
          />
        </View>
        <View style={st.tabWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.tabs}
          >
            {sections.map(([key, title]) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityLabel={title}
                accessibilityState={{ selected: active === key }}
                aria-selected={active === key}
                onPress={() => router.replace(tripHref(trip.id, key))}
                style={[st.tab, active === key && st.activeTab]}
              >
                <Text
                  style={[
                    st.tabText,
                    active === key && { color: p.primary, fontWeight: "700" },
                  ]}
                >
                  {title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <KeyboardAvoidingView
          key={active}
          style={{ flex: 1, minHeight: 0 }}
          behavior={keyboardBehavior}
          keyboardVerticalOffset={insets.top}
        >
          {active === "chat" && <ChatRoomSelector />}
          <ContentScroll
            style={active === "chat" ? st.chatMessages : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              active === "chat" ? st.chatContent : st.content
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await refresh();
                  setRefreshing(false);
                }}
              />
            }
          >
            <ErrorMessage message={error} />
            <ReadOnlyNote />
            {content}
          </ContentScroll>
          {active === "chat" && <ChatComposer />}
        </KeyboardAvoidingView>
      </Frame>
    </ChatRoomProvider>
  );
}
const st = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: p.white,
  },
  tabWrap: {
    height: 49,
    backgroundColor: p.white,
    borderBottomWidth: 1,
    borderBottomColor: p.border,
  },
  tabs: { paddingHorizontal: 17, gap: 21 },
  tab: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 3,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: p.primary },
  tabText: { fontSize: 13, color: p.secondary },
  chatMessages: { flex: 1, minHeight: 0 },
  chatContent: { paddingHorizontal: 16, paddingVertical: 12 },
  content: { padding: 21, paddingBottom: 32 },
});
