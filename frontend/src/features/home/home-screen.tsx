import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { money, shortDate, type Trip } from "../../domain/models";
import { useTravel } from "../../state/travel-provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorMessage,
  Icon,
  People,
  Section,
  styles as s,
  type IconName,
} from "../../ui/components";
import { Page } from "../../ui/shell";
import { palette as p } from "../../ui/theme";
import { TravelCover } from "../../ui/travel-cover";

export function tripHref(tripId: string, section = "overview") {
  return `/trip/${tripId}/${section}` as const;
}
function TripCard({ trip }: { trip: Trip }) {
  const { data } = useTravel();
  const days = Math.round(
    (Date.parse(`${trip.startDate}T00:00:00`) -
      new Date().setHours(0, 0, 0, 0)) /
      86400000,
  );
  const status = trip.archived
    ? "여행 종료"
    : days > 0
      ? `D-${days}`
      : Date.now() <= Date.parse(`${trip.endDate}T23:59:59`)
        ? "여행 중"
        : "다녀온 여행";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trip.title} 열기`}
      onPress={() => router.push(tripHref(trip.id))}
      style={st.tripCard}
    >
      <TravelCover contentStyle={st.tripImage}>
        <View style={s.between}>
          <Badge background={p.white}>{status}</Badge>
          <Icon name="arrow" color={p.white} />
        </View>
        <View style={st.tripBottom}>
          <Text style={st.tripTitle}>{trip.title}</Text>
          <Text style={st.tripDates}>
            {shortDate(trip.startDate)} — {shortDate(trip.endDate)} ·{" "}
            {trip.destination}
          </Text>
          <View style={[s.between, { marginTop: 15 }]}>
            <People
              users={data!.users.filter((u) => trip.memberIds.includes(u.id))}
            />
            <Text style={st.tripDates}>함께하는 {trip.memberIds.length}명</Text>
          </View>
        </View>
      </TravelCover>
    </Pressable>
  );
}
const shortcuts: {
  section: string;
  label: string;
  icon: IconName;
  color: string;
  background: string;
}[] = [
  {
    section: "schedule",
    label: "여행 일정",
    icon: "calendar",
    color: p.primary,
    background: p.blueSoft,
  },
  {
    section: "places",
    label: "저장 장소",
    icon: "pin",
    color: p.coral,
    background: p.coralSoft,
  },
  {
    section: "expenses",
    label: "공동 정산",
    icon: "wallet",
    color: p.mint,
    background: p.mintSoft,
  },
  {
    section: "checklist",
    label: "준비물",
    icon: "checklist",
    color: p.purple,
    background: p.purpleSoft,
  },
];
export function HomeScreen() {
  const { data, session, error, refresh } = useTravel();
  const current = data?.trips.find((t) => !t.archived) ?? data?.trips[0];
  const todos = current?.checklist.filter((c) => !c.done).length ?? 0;
  return (
    <Page
      refresh
      title="WeGoTrip"
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="프로필 열기"
          onPress={() => router.push("/profile")}
        >
          <Avatar user={session?.user} size={38} />
        </Pressable>
      }
    >
      <View style={st.greeting}>
        <Text style={st.eyebrow}>LET’S GO SOMEWHERE</Text>
        <Text style={s.title}>{session?.user.name}님, 어디로 떠날까요?</Text>
        <Text style={[s.body, { marginTop: 7 }]}>
          함께할수록 더 좋은 여행의 시작.
        </Text>
      </View>
      <ErrorMessage message={error} />
      {!!error && (
        <Button
          title="다시 불러오기"
          secondary
          onPress={() => void refresh()}
        />
      )}
      <Section
        title="기다려지는 우리 여행"
        action="전체 보기"
        onPress={() => router.push("/trips")}
      />
      {current ? (
        <TripCard trip={current} />
      ) : (
        <Empty
          title="첫 여행을 만들어 보세요"
          description="친구들과 함께 일정을 채워 나가요."
          action="여행 만들기"
          onPress={() => router.push("/trip/new")}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="새 여행 만들기"
        onPress={() => router.push("/trip/new")}
        style={st.newTrip}
      >
        <View style={s.flex}>
          <Text style={s.strong}>새로운 추억을 만들 시간</Text>
          <Text style={[s.small, { marginTop: 5 }]}>
            여행을 만들고, 함께할 친구를 초대해요.
          </Text>
        </View>
        <View style={st.newPlus}>
          <Icon name="plus" color={p.mint} size={25} />
        </View>
      </Pressable>
      <Section title="여행 준비, 한 번에" />
      <View style={st.shortcuts}>
        {shortcuts.map((item) => (
          <Pressable
            key={item.section}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() =>
              current
                ? router.push(tripHref(current.id, item.section))
                : router.push("/trip/new")
            }
            style={st.shortcut}
          >
            <View
              style={[st.shortcutIcon, { backgroundColor: item.background }]}
            >
              <Icon name={item.icon} color={item.color} size={24} />
            </View>
            <Text style={st.shortcutLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {current && (
        <>
          <Section title="출발 전에 확인해요" />
          <Card>
            <View style={s.row}>
              <View style={st.reminderIcon}>
                <Icon name="checklist" color={p.primary} />
              </View>
              <View style={s.flex}>
                <Text style={s.strong}>
                  {todos
                    ? `아직 ${todos}개의 준비물이 남았어요`
                    : "준비물 확인을 모두 마쳤어요"}
                </Text>
                <Text style={s.small}>하나씩 체크하고 가볍게 출발해요.</Text>
              </View>
            </View>
            <Button
              title="준비물 확인하기"
              secondary
              onPress={() => router.push(tripHref(current.id, "checklist"))}
            />
          </Card>
          <View style={[st.budget, { marginTop: 14 }]}>
            <Text style={s.small}>함께 세운 여행 예산</Text>
            <Text style={s.strong}>{money(current.budget)}</Text>
          </View>
        </>
      )}
    </Page>
  );
}
export function TripsScreen() {
  const { data, error } = useTravel();
  const [filter, setFilter] = useState("함께할 여행");
  const trips =
    data?.trips.filter((t) =>
      filter === "함께할 여행" ? !t.archived : t.archived,
    ) ?? [];
  return (
    <Page title="내 여행" subtitle="우리의 모든 여정이 모이는 곳" refresh>
      <View style={s.wrap}>
        {["함께할 여행", "다녀온 여행"].map((v) => (
          <Chip
            key={v}
            title={v}
            active={filter === v}
            onPress={() => setFilter(v)}
          />
        ))}
      </View>
      <ErrorMessage message={error} />
      <View style={{ marginTop: 20, gap: 18 }}>
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </View>
      {!trips.length && (
        <Empty
          title="아직 여행이 없어요"
          description="새 여행을 만들거나 초대 코드로 참여해 보세요."
        />
      )}
      <View style={{ marginTop: 22 }}>
        <Button
          title="여행 만들기 또는 초대 참여"
          icon="plus"
          onPress={() => router.push("/trip/new")}
        />
      </View>
    </Page>
  );
}
const st = StyleSheet.create({
  greeting: { paddingTop: 4 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.7,
    color: p.mint,
    marginBottom: 9,
  },
  tripCard: { borderRadius: 21, overflow: "hidden" },
  tripImage: { padding: 19, justifyContent: "space-between" },
  tripBottom: { paddingTop: 30 },
  tripTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: p.white,
    letterSpacing: -0.6,
  },
  tripDates: { color: "#F2F8FF", fontSize: 11, lineHeight: 20, marginTop: 5 },
  newTrip: {
    marginTop: 15,
    borderRadius: 18,
    padding: 19,
    backgroundColor: p.mintSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#C9EEE5",
  },
  newPlus: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: p.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcuts: { flexDirection: "row", justifyContent: "space-between" },
  shortcut: { alignItems: "center", flex: 1, gap: 9, minHeight: 79 },
  shortcutIcon: {
    width: 53,
    height: 53,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  shortcutLabel: { fontSize: 11, color: p.ink, fontWeight: "600" },
  reminderIcon: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  budget: {
    borderRadius: 15,
    padding: 17,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: p.blueSoft,
    gap: 8,
  },
});
