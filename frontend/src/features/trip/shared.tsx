import { Text, View } from "react-native";
import { datesBetween, type Collection } from "../../domain/models";
import { Chip, styles as s } from "../../ui/components";
import { SelectField } from "../../ui/select-field";
import { useTrip } from "./trip-context";
export function editHref(
  id: string,
  kind: Collection | "settings",
  itemId?: string,
  placeId?: string,
) {
  return {
    pathname: "/trip/[tripId]/edit" as const,
    params: {
      tripId: id,
      kind,
      ...(itemId ? { itemId } : {}),
      ...(placeId ? { placeId } : {}),
    },
  };
}
export function DateFilter() {
  const { trip, date, setDate } = useTrip();
  if (!trip) return null;
  const days = datesBetween(trip.startDate, trip.endDate);
  return (
    <SelectField
      title="여행 날짜"
      icon="calendar"
      value={date}
      options={days.map((day, i) => {
        const [, month, dayOfMonth] = day.split("-");
        const weekday = ["일", "월", "화", "수", "목", "금", "토"][
          new Date(`${day}T12:00:00`).getDay()
        ];
        return {
          value: day,
          label: `${Number(month)}월 ${Number(dayOfMonth)}일 (${weekday})`,
          description: `DAY ${i + 1} · ${day.replaceAll("-", ".")}`,
        };
      })}
      onChange={(day) => {
        if (day) setDate(day);
      }}
      searchPlaceholder="날짜 또는 DAY 검색"
      emptyText="찾는 날짜가 없어요. 여행 기간 안에서 검색해 주세요."
      hint={`${days.length}일간의 여정 · 날짜를 선택해 일정을 확인하세요`}
    />
  );
}
export function PartyFilter() {
  const { trip, partyId, setPartyId } = useTrip();
  if (!trip?.parties.length) return null;
  const parties = trip.parties;
  return (
    <View style={[s.wrap, { marginBottom: 15 }]}>
      <Chip title="전체" active={!partyId} onPress={() => setPartyId(null)} />
      {parties.map((p) => (
        <Chip
          key={p.id}
          title={p.name}
          active={partyId === p.id}
          onPress={() => setPartyId(p.id)}
        />
      ))}
    </View>
  );
}
export function ReadOnlyNote() {
  const { trip } = useTrip();
  return trip?.archived ? (
    <Text style={[s.small, { marginBottom: 12 }]}>
      종료한 여행이에요. 설정에서 다시 열 수 있어요.
    </Text>
  ) : null;
}
