import { router } from "expo-router";
import { useState } from "react";
import {
  ImageBackground,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  calculateSettlement,
  localDate,
  datesBetween,
  money,
  shortDate,
} from "../../domain/models";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorMessage,
  Field,
  Icon,
  People,
  Section,
  styles as s,
} from "../../ui/components";
import { cover, palette as p } from "../../ui/theme";
import { tripHref } from "../home/home-screen";
import { DateFilter, editHref, PartyFilter } from "./shared";
import { useTrip } from "./trip-context";

export function OverviewSection() {
  const { trip: t, data } = useTrip();
  const trip = t!;
  const amounts = calculateSettlement(trip);
  const checked = trip.checklist.filter((c) => c.done).length;
  const today = localDate();
  const upcoming = [...trip.agenda]
    .filter((a) => a.date >= today)
    .sort((a, b) =>
      `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`),
    )
    .slice(0, 2);
  const notice = [...trip.notices].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.createdAt.localeCompare(a.createdAt),
  )[0];
  return (
    <>
      <ImageBackground
        source={cover}
        style={st.hero}
        imageStyle={{ width: "100%", height: "100%", borderRadius: 22 }}
      >
        <View style={st.heroTint} />
        <Badge background={p.white}>
          {trip.archived
            ? "여행 종료"
            : `${datesBetween(trip.startDate, trip.endDate).length}일간의 여정`}
        </Badge>
        <View>
          <Text style={st.heroTitle}>{trip.title}</Text>
          <Text style={st.heroSub}>
            {shortDate(trip.startDate)} — {shortDate(trip.endDate)} ·{" "}
            {trip.destination}
          </Text>
          <View style={{ marginTop: 12 }}>
            <People
              users={data!.users.filter((u) => trip.memberIds.includes(u.id))}
            />
          </View>
        </View>
      </ImageBackground>
      <View style={st.stats}>
        <View style={[s.card, s.flex, { minWidth: 140 }]}>
          <Text style={s.small}>우리의 예산</Text>
          <Text style={st.statAmount}>{money(trip.budget)}</Text>
        </View>
        <View style={[s.card, s.flex, { minWidth: 140 }]}>
          <Text style={s.small}>지금까지 지출</Text>
          <Text style={[st.statAmount, { color: p.primary }]}>
            {money(amounts.total)}
          </Text>
        </View>
      </View>
      {notice && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="고정 공지 보기"
          onPress={() => router.push(tripHref(trip.id, "notices"))}
          style={st.notice}
        >
          <Icon name="notice" color={p.coral} />
          <View style={s.flex}>
            <Text style={s.strong}>{notice.title}</Text>
            <Text style={s.small} numberOfLines={1}>
              {notice.body}
            </Text>
          </View>
          <Icon name="arrow" size={17} color={p.secondary} />
        </Pressable>
      )}
      <Section
        title="우리 여행 한눈에"
        action="일정 보기"
        onPress={() => router.push(tripHref(trip.id, "schedule"))}
      />
      <Card>
        <View style={s.row}>
          <Icon name="pin" color={p.primary} />
          <Text style={s.body}>{trip.destination}</Text>
        </View>
        <View style={s.row}>
          <Icon name="calendar" color={p.primary} />
          <Text style={s.body}>
            {trip.startDate} ~ {trip.endDate}
          </Text>
        </View>
        <View style={s.row}>
          <Icon name="users" color={p.primary} />
          <Text style={s.body}>
            함께하는 {trip.memberIds.length}명 · 파티 {trip.parties.length}개
          </Text>
        </View>
      </Card>
      <Section
        title="차근차근 여행 준비"
        action="준비물 보기"
        onPress={() => router.push(tripHref(trip.id, "checklist"))}
      />
      <Card>
        <View style={s.between}>
          <Text style={s.strong}>준비물 체크리스트</Text>
          <Badge>
            {checked} / {trip.checklist.length}
          </Badge>
        </View>
        <View style={st.progress}>
          <View
            style={[
              st.progressFill,
              {
                width: `${trip.checklist.length ? (checked / trip.checklist.length) * 100 : 0}%`,
              },
            ]}
          />
        </View>
        <Text style={s.small}>
          {trip.checklist.length - checked}개의 준비물이 남아 있어요.
        </Text>
      </Card>
      {upcoming.length > 0 && (
        <>
          <Section
            title="다가오는 일정"
            action="전체 일정"
            onPress={() => router.push(tripHref(trip.id, "schedule"))}
          />
          {upcoming.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`${a.title} 상세`}
              onPress={() => router.push(editHref(trip.id, "agenda", a.id))}
              style={{ marginBottom: 12 }}
            >
              <Card>
                <Text style={s.small}>
                  {shortDate(a.date)} · {a.startTime} — {a.endTime}
                </Text>
                <Text style={s.strong}>{a.title}</Text>
                <Text style={s.small}>
                  {trip.places.find((p) => p.id === a.placeId)?.name ??
                    "장소 미정"}
                </Text>
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </>
  );
}
export function ScheduleSection() {
  const { trip: t, date, partyId } = useTrip();
  const trip = t!;
  const agenda = trip.agenda
    .filter(
      (a) =>
        a.date === date &&
        (!partyId || a.partyId === null || a.partyId === partyId),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return (
    <>
      <DateFilter />
      <PartyFilter />
      <Section
        title={`${shortDate(date)}의 여행`}
        action="일정 추가"
        onPress={() => router.push(editHref(trip.id, "agenda"))}
      />
      {agenda.map((a, i) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`${a.title} 수정`}
          onPress={() => router.push(editHref(trip.id, "agenda", a.id))}
          style={st.agendaRow}
        >
          <View style={st.timeColumn}>
            <Text style={st.time}>{a.startTime}</Text>
            <Text style={s.small}>{a.endTime}</Text>
            <View
              style={[
                st.dot,
                { backgroundColor: a.partyId ? p.coral : p.primary },
              ]}
            />
            {i < agenda.length - 1 && <View style={st.line} />}
          </View>
          <View
            style={[
              s.card,
              s.flex,
              a.partyId && {
                backgroundColor: "#FFF5F2",
                borderColor: "#FAE3DC",
              },
            ]}
          >
            <Badge
              background={a.partyId ? "#FFE4DD" : p.blueSoft}
              color={a.partyId ? "#CB6253" : p.primary}
            >
              {trip.parties.find((p) => p.id === a.partyId)?.name ??
                "모두 함께"}
            </Badge>
            <Text style={s.strong}>{a.title}</Text>
            <View style={s.row}>
              <Icon name="pin" size={14} color={p.secondary} />
              <Text style={[s.small, s.flex]}>
                {trip.places.find((p) => p.id === a.placeId)?.name ??
                  "장소 미정"}
              </Text>
            </View>
            {!!a.note && <Text style={s.small}>{a.note}</Text>}
          </View>
        </Pressable>
      ))}
      {!agenda.length && (
        <Empty
          title="아직 비어 있는 하루예요"
          description="함께할 일정을 하나씩 채워 볼까요?"
          action="첫 일정 추가"
          onPress={() => router.push(editHref(trip.id, "agenda"))}
        />
      )}
      <Text style={[s.small, { marginTop: 16 }]}>
        일정을 눌러 수정할 수 있어요. 파티를 선택해도 함께 합류하는 일정은
        표시됩니다.
      </Text>
    </>
  );
}
export function PlacesSection() {
  const { trip: t, date, partyId } = useTrip();
  const trip = t!;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [view, setView] = useState("장소 목록");
  const [error, setError] = useState("");
  const list = trip.places.filter(
    (item) =>
      `${item.name} ${item.address}`.includes(search) &&
      (category === "전체" || item.category === category),
  );
  const route = trip.agenda
    .filter(
      (a) =>
        a.date === date &&
        a.placeId &&
        (!partyId || !a.partyId || a.partyId === partyId),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  async function openMap(name: string, address: string) {
    try {
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`,
      );
    } catch {
      setError("지도 앱을 열지 못했어요. 주소를 확인해 주세요.");
    }
  }
  return (
    <>
      <Field
        title="저장한 장소 검색"
        value={search}
        onChangeText={setSearch}
        placeholder="장소 이름 또는 주소"
      />
      <View style={[s.wrap, { marginBottom: 16 }]}>
        {["장소 목록", "날짜별 동선"].map((v) => (
          <Chip
            key={v}
            title={v}
            active={view === v}
            onPress={() => setView(v)}
          />
        ))}
      </View>
      <ErrorMessage message={error} />
      {view === "장소 목록" ? (
        <>
          <View style={s.wrap}>
            {["전체", "음식점", "카페", "숙소", "볼거리", "교통"].map((v) => (
              <Chip
                key={v}
                title={v}
                active={category === v}
                onPress={() => setCategory(v)}
              />
            ))}
          </View>
          <Section
            title={`저장한 장소 ${list.length}`}
            action="장소 추가"
            onPress={() => router.push(editHref(trip.id, "places"))}
          />
          {list.map((place) => (
            <View key={place.id} style={{ marginBottom: 14 }}>
              <Card>
                <View style={s.between}>
                  <Badge color={p.mint} background={p.mintSoft}>
                    {place.category}
                  </Badge>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${place.name} 수정`}
                    style={s.iconButton}
                    onPress={() =>
                      router.push(editHref(trip.id, "places", place.id))
                    }
                  >
                    <Icon name="edit" size={20} color={p.secondary} />
                  </Pressable>
                </View>
                <Text style={s.sectionTitle}>{place.name}</Text>
                <Text style={s.small}>{place.address}</Text>
                {!!place.note && <Text style={s.body}>{place.note}</Text>}
                <View style={s.wrap}>
                  <Button
                    title="지도 열기"
                    secondary
                    icon="map"
                    onPress={() => void openMap(place.name, place.address)}
                  />
                  <Button
                    title="일정에 추가"
                    secondary
                    icon="plus"
                    onPress={() =>
                      router.push(
                        editHref(trip.id, "agenda", undefined, place.id),
                      )
                    }
                  />
                </View>
              </Card>
            </View>
          ))}
          {!list.length && (
            <Empty
              title="저장한 장소가 없어요"
              description="검색 조건을 바꾸거나 가고 싶은 곳을 저장해 보세요."
            />
          )}
        </>
      ) : (
        <>
          <DateFilter />
          <PartyFilter />
          <Text style={[s.body, { marginBottom: 18 }]}>
            일정에 등록한 순서대로 방문할 장소예요.
          </Text>
          {route.map((a, i) => {
            const place = trip.places.find((p) => p.id === a.placeId);
            return (
              place && (
                <View key={a.id} style={[s.row, { marginBottom: 12 }]}>
                  <Badge>{i + 1}</Badge>
                  <View style={s.flex}>
                    <Card>
                      <Text style={s.strong}>
                        {a.startTime} · {place.name}
                      </Text>
                      <Text style={s.small}>{place.address}</Text>
                      <Button
                        title="지도에서 위치 보기"
                        secondary
                        onPress={() => void openMap(place.name, place.address)}
                      />
                    </Card>
                  </View>
                </View>
              )
            );
          })}
          {!route.length && (
            <Empty
              title="아직 연결한 장소가 없어요"
              description="일정에 장소를 연결하면 방문 순서를 확인할 수 있어요."
            />
          )}
        </>
      )}
    </>
  );
}
const st = StyleSheet.create({
  hero: {
    minHeight: 221,
    padding: 19,
    borderRadius: 22,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  heroTint: { ...StyleSheet.absoluteFill, backgroundColor: "#09355655" },
  heroTitle: {
    color: p.white,
    fontWeight: "800",
    fontSize: 27,
    letterSpacing: -0.5,
  },
  heroSub: { color: "#EAF7FF", fontSize: 12, marginTop: 7 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 15 },
  statAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: p.ink,
    letterSpacing: -0.5,
  },
  notice: {
    backgroundColor: p.coralSoft,
    borderRadius: 17,
    padding: 17,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 15,
  },
  progress: {
    height: 6,
    borderRadius: 6,
    backgroundColor: p.border,
    overflow: "hidden",
    marginVertical: 6,
  },
  progressFill: { height: 6, backgroundColor: p.mint, borderRadius: 6 },
  agendaRow: { flexDirection: "row", gap: 9, marginBottom: 13 },
  timeColumn: { width: 49, position: "relative", paddingTop: 8 },
  time: { color: p.ink, fontSize: 12, fontWeight: "700" },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    position: "absolute",
    top: 55,
    left: 13,
  },
  line: {
    position: "absolute",
    width: 1,
    top: 68,
    bottom: -8,
    left: 16,
    backgroundColor: "#C7D7E8",
  },
});
