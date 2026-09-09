import { ScrollView, Text, View } from "react-native";
import { datesBetween, shortDate, type Collection } from "../../domain/models";
import { Chip, styles as s } from "../../ui/components";
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
    >
      {datesBetween(trip.startDate, trip.endDate).map((day, i) => (
        <Chip
          key={day}
          title={`DAY ${i + 1} · ${shortDate(day)}`}
          active={date === day}
          onPress={() => setDate(day)}
        />
      ))}
    </ScrollView>
  );
}
export function PartyFilter({
  includeDate = false,
}: {
  includeDate?: boolean;
}) {
  const { trip, partyId, setPartyId, date } = useTrip();
  if (!trip?.parties.length) return null;
  const parties = trip.parties.filter((p) => !includeDate || p.date === date);
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
