import type { Agenda, Coordinates, Place, Trip } from "./models";

export function validCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const { latitude, longitude } = value as Coordinates;
  return (
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  );
}

export function parseCoordinates(
  latitude: string,
  longitude: string,
): Coordinates | null {
  if (!latitude.trim() && !longitude.trim()) return null;
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const value = { latitude: Number(latitude), longitude: Number(longitude) };
  if (
    !decimal.test(latitude.trim()) ||
    !decimal.test(longitude.trim()) ||
    !validCoordinates(value)
  )
    throw new Error(
      "위도(-90~90)와 경도(-180~180)를 모두 숫자로 입력해 주세요.",
    );
  return value;
}

export interface RouteStop {
  agenda: Agenda;
  place: Place | undefined;
  coordinates: Coordinates | null;
  number: number;
}
export interface RouteSegment {
  from: RouteStop;
  to: RouteStop;
  partyId: string | null;
}

export function buildDayRoute(
  trip: Trip,
  date: string,
  partyId: string | null,
) {
  const agenda = trip.agenda
    .filter(
      (a) =>
        a.date === date && (!partyId || !a.partyId || a.partyId === partyId),
    )
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id),
    );
  const stops: RouteStop[] = agenda.map((a, index) => {
    const place = trip.places.find((p) => p.id === a.placeId);
    return {
      agenda: a,
      place,
      coordinates: validCoordinates(place?.coordinates)
        ? place.coordinates
        : null,
      number: index + 1,
    };
  });
  // Each party follows its own lane plus the common agenda. Never connect two different parties.
  const parties = partyId
    ? [partyId]
    : [...new Set(agenda.flatMap((a) => (a.partyId ? [a.partyId] : [])))];
  const lanes: (string | null)[] = parties.length ? parties : [null];
  const segments: RouteSegment[] = [];
  const seen = new Set<string>();
  for (const lane of lanes) {
    const route = stops.filter(
      (s) => !s.agenda.partyId || s.agenda.partyId === lane,
    );
    for (let i = 1; i < route.length; i++) {
      const from = route[i - 1],
        to = route[i];
      // Missing locations and overlapping times are breaks, not an invented route through them.
      if (
        !from.coordinates ||
        !to.coordinates ||
        from.agenda.endTime > to.agenda.startTime
      )
        continue;
      const key = `${from.agenda.id}:${to.agenda.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({
        from,
        to,
        partyId: from.agenda.partyId || to.agenda.partyId,
      });
    }
  }
  return {
    agenda,
    stops,
    segments,
    located: stops.filter((s) => s.coordinates),
    missing: stops.filter((s) => !s.coordinates),
  };
}
