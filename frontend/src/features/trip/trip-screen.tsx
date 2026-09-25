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
import { useRef, useState } from "react";
import { useTrip } from "./trip-context";
import { BottomBar, Frame } from "../../ui/shell";
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
import {
  ChatComposer,
  ChatSection,
  ChecklistSection,
  NoticesSection,
} from "./collaboration-sections";
import { editHref, ReadOnlyNote } from "./shared";
import { tripHref } from "../home/home-screen";
import type { Collection } from "../../domain/models";
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
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  if (!trip)
    return (
      <Frame>
        <Empty
          title="여행을 찾을 수 없어요"
          description={
            error || "초대를 확인하거나 내 여행에서 다시 선택해 주세요."
          }
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
  const kind = {
    overview: "agenda",
    schedule: "agenda",
    places: "places",
    expenses: "expenses",
    checklist: "checklist",
    notices: "notices",
    chat: "notices",
  }[active] as Exclude<Collection, "messages">;
  return (
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
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.content}
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
          onContentSizeChange={() => {
            if (active === "chat")
              scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          <ErrorMessage message={error} />
          <ReadOnlyNote />
          {content}
        </ScrollView>
        {active === "chat" && <ChatComposer />}
      </KeyboardAvoidingView>
      <BottomBar add={() => router.push(editHref(trip.id, kind))} />
    </Frame>
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
  content: { padding: 21, paddingBottom: 32 },
});
