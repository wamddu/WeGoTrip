import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { buildDayRoute } from "../../domain/route";
import type { Trip } from "../../domain/models";
import { GeographicMap, type MapMarker } from "../../ui/geographic-map";
import { Badge, Button, Empty, styles as s } from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { editHref } from "./shared";

export function ScheduleMap({
  trip,
  date,
  partyId,
}: {
  trip: Trip;
  date: string;
  partyId: string | null;
}) {
  const route = buildDayRoute(trip, date, partyId);
  const [selected, setSelected] = useState<string | null>(null);
  const partyColor = (id: string | null) =>
    !id
      ? p.primary
      : [p.coral, p.purple, p.mint][
          Math.max(
            0,
            trip.parties.findIndex((party) => party.id === id),
          ) % 3
        ];
  // A repeated visit keeps its schedule number, while a shared coordinate gets one readable pin.
  const groups = new Map<string, typeof route.located>();
  for (const stop of route.located) {
    const key = `${stop.coordinates!.latitude}:${stop.coordinates!.longitude}`;
    groups.set(key, [...(groups.get(key) ?? []), stop]);
  }
  const markers: MapMarker[] = [...groups.values()].map((stops) => ({
    id: stops[0].agenda.id,
    label: stops.map((s) => s.number).join("·"),
    title: stops[0].place!.name,
    coordinates: stops[0].coordinates!,
    color: partyColor(stops[0].agenda.partyId),
  }));
  const selectedStop = route.stops.find((s) => s.agenda.id === selected);
  const selectedMarker = selectedStop?.coordinates
    ? markers.find(
        (m) =>
          m.coordinates.latitude === selectedStop.coordinates!.latitude &&
          m.coordinates.longitude === selectedStop.coordinates!.longitude,
      )?.id
    : null;
  return (
    <View style={st.root}>
      <View style={s.between}>
        <Text style={s.strong}>오늘의 동선</Text>
        <Badge>
          {route.located.length} / {route.stops.length}개 위치
        </Badge>
      </View>
      {route.located.length ? (
        <>
          <GeographicMap
            key={`${date}:${partyId}:${markers.map((m) => `${m.id}:${m.coordinates.latitude}:${m.coordinates.longitude}`).join("|")}`}
            markers={markers}
            selectedId={selectedMarker}
            onSelect={setSelected}
            lines={route.segments.map((line) => ({
              id: `${line.from.agenda.id}:${line.to.agenda.id}`,
              from: line.from.coordinates!,
              to: line.to.coordinates!,
              color: partyColor(line.partyId),
            }))}
          />
          <View style={s.wrap}>
            <Badge>모두 함께</Badge>
            {trip.parties
              .filter((party) =>
                route.agenda.some((a) => a.partyId === party.id),
              )
              .map((party) => (
                <Badge key={party.id} color={partyColor(party.id)}>
                  {party.name}
                </Badge>
              ))}
          </View>
          <Text style={s.small}>
            점선은 일정의 방문 순서예요. 실제 도로 경로나 이동 시간은 포함하지
            않아요.
          </Text>
          {route.located.length === 1 && (
            <Text style={s.small}>
              위치가 있는 일정이 2개 이상이면 연결선이 나타나요.
            </Text>
          )}
        </>
      ) : (
        <Empty
          title={
            route.stops.length
              ? "장소의 위치를 등록해 주세요"
              : "아직 동선이 없어요"
          }
          description={
            route.stops.length
              ? "아래 일정의 장소에 위치를 저장하면 지도에 표시돼요."
              : "일정과 방문 장소를 추가하면 하루의 동선을 볼 수 있어요."
          }
        />
      )}
      {route.stops.map((stop) => (
        <Pressable
          key={stop.agenda.id}
          accessibilityRole="button"
          accessibilityLabel={`${stop.number}번 ${stop.agenda.title} ${stop.coordinates ? "지도에서 선택" : "위치 등록"}`}
          onPress={() =>
            stop.coordinates
              ? setSelected(stop.agenda.id)
              : router.push(
                  editHref(
                    trip.id,
                    stop.place ? "places" : "agenda",
                    stop.place?.id ?? stop.agenda.id,
                  ),
                )
          }
          style={[st.stop, selected === stop.agenda.id && st.selected]}
        >
          <Badge color={partyColor(stop.agenda.partyId)}>{stop.number}</Badge>
          <View style={s.flex}>
            <Text style={s.strong}>
              {stop.place?.name ?? stop.agenda.title}
            </Text>
            <Text style={s.small}>
              {stop.agenda.startTime} · {stop.agenda.title}
            </Text>
          </View>
          {!stop.coordinates && (
            <Text style={st.register}>
              {stop.place ? "위치 등록" : "장소 연결"}
            </Text>
          )}
        </Pressable>
      ))}
      {selectedStop?.coordinates && (
        <View style={st.detail}>
          <Text style={s.strong}>
            {selectedStop.number}번 · {selectedStop.place!.name}
          </Text>
          <Text style={s.small}>{selectedStop.place!.address}</Text>
          <Button
            title="일정 수정"
            secondary
            icon="edit"
            onPress={() =>
              router.push(editHref(trip.id, "agenda", selectedStop.agenda.id))
            }
          />
        </View>
      )}
      {route.missing.length > 0 && route.located.length > 0 && (
        <Text style={s.small}>
          위치가 없는 일정 {route.missing.length}개는 지도에서 제외돼요. 해당
          구간의 선은 연결하지 않아요.
        </Text>
      )}
    </View>
  );
}
const st = StyleSheet.create({
  root: { gap: 12 },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 14,
    backgroundColor: p.white,
  },
  selected: { borderColor: p.primary, backgroundColor: p.blueSoft },
  register: { fontSize: 11, color: p.primary, fontWeight: "700" },
  detail: {
    padding: 15,
    borderRadius: 15,
    backgroundColor: p.blueSoft,
    gap: 8,
  },
});
