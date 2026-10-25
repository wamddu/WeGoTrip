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

export interface EffectiveAgenda extends Agenda {
  occurrenceId: string;
  originalStartTime: string;
  originalEndTime: string;
}
export interface RouteStop {
  key: string;
  agenda: EffectiveAgenda;
  place: Place | undefined;
  coordinates: Coordinates | null;
  number: number;
}
export interface RouteSegment {
  from: RouteStop;
  to: RouteStop;
  partyId: string | null;
}
export function compareAgenda(a: Agenda, b: Agenda) {
  const byDateAndTime =
    a.date.localeCompare(b.date) ||
    (a.startTime || "24:00").localeCompare(b.startTime || "24:00");
  if (byDateAndTime) return byDateAndTime;
  // Database IDs stay strings, including values above JavaScript's safe integer range.
  return /^[1-9][0-9]*$/.test(a.id) && /^[1-9][0-9]*$/.test(b.id)
    ? a.id.length - b.id.length || a.id.localeCompare(b.id)
    : a.id.localeCompare(b.id);
}

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validTimeRange = (agenda: Agenda) =>
  validTime(agenda.startTime) &&
  validTime(agenda.endTime) &&
  agenda.startTime <= agenda.endTime;

function occurrence(
  agenda: Agenda,
  startTime = agenda.startTime,
  endTime = agenda.endTime,
): EffectiveAgenda {
  return {
    ...agenda,
    startTime,
    endTime,
    occurrenceId: JSON.stringify([agenda.id, agenda.date, startTime, endTime]),
    originalStartTime: agenda.startTime,
    originalEndTime: agenda.endTime,
  };
}

/** Derive attendance intervals without changing any stored schedule. */
export function getEffectiveAgenda(
  trip: Trip,
  date: string,
  partyId: string | null,
): EffectiveAgenda[] {
  const day = trip.agenda.filter((agenda) => agenda.date === date);
  if (!partyId)
    return day.map((agenda) => occurrence(agenda)).sort(compareAgenda);

  // Only this subgroup's known, positive-duration intervals override common attendance.
  const intervals = day
    .filter(
      (agenda) =>
        agenda.partyId === partyId &&
        validTimeRange(agenda) &&
        agenda.startTime < agenda.endTime,
    )
    .map((agenda) => ({ start: agenda.startTime, end: agenda.endTime }))
    .sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
  const occupied: { start: string; end: string }[] = [];
  for (const interval of intervals) {
    const previous = occupied[occupied.length - 1];
    if (previous && interval.start <= previous.end) {
      if (interval.end > previous.end) previous.end = interval.end;
    } else occupied.push({ ...interval });
  }

  const effective: EffectiveAgenda[] = [];
  for (const agenda of day) {
    if (agenda.partyId) {
      if (agenda.partyId === partyId) effective.push(occurrence(agenda));
      continue;
    }
    if (!validTimeRange(agenda)) {
      effective.push(occurrence(agenda));
      continue;
    }
    if (agenda.startTime === agenda.endTime) {
      // A point event belongs to [start, end), so the subgroup's end boundary is free.
      if (
        !occupied.some(
          (interval) =>
            interval.start <= agenda.startTime &&
            agenda.startTime < interval.end,
        )
      )
        effective.push(occurrence(agenda));
      continue;
    }

    let availableFrom = agenda.startTime;
    for (const interval of occupied) {
      if (interval.end <= availableFrom) continue;
      if (interval.start >= agenda.endTime) break;
      if (interval.start > availableFrom)
        effective.push(occurrence(agenda, availableFrom, interval.start));
      if (interval.end > availableFrom) availableFrom = interval.end;
      if (availableFrom >= agenda.endTime) break;
    }
    if (availableFrom < agenda.endTime)
      effective.push(occurrence(agenda, availableFrom, agenda.endTime));
  }
  return effective.sort(compareAgenda);
}

export function buildDayRoute(
  trip: Trip,
  date: string,
  partyId: string | null,
) {
  const agenda = getEffectiveAgenda(trip, date, partyId);
  const stops: RouteStop[] = agenda.map((a, index) => {
    const place = trip.places.find((p) => p.id === a.placeId);
    return {
      key: a.occurrenceId,
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
        !validTimeRange(from.agenda) ||
        !validTimeRange(to.agenda) ||
        from.agenda.endTime > to.agenda.startTime
      )
        continue;
      const key = JSON.stringify([from.key, to.key]);
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
