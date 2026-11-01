import type { Trip } from "../domain/models";

export const MAIN_SCREENS = [
  "home",
  "trips",
  "notifications",
  "profile",
] as const;

const createKinds = {
  overview: "agenda",
  schedule: "agenda",
  places: "places",
  expenses: "expenses",
  checklist: "checklist",
  notices: "notices",
} as const;

export interface BottomNavigation {
  visible: boolean;
  addHref:
    | "/trip/new"
    | {
        pathname: "/trip/[tripId]/edit";
        params: {
          tripId: string;
          kind: (typeof createKinds)[keyof typeof createKinds];
        };
      };
  addDisabled: boolean;
}

/** Derive actions from the active route, never from a screen retained in a stack. */
export function bottomNavigation(
  pathname: string,
  state: {
    trips: readonly Pick<Trip, "id" | "ownerId" | "archived">[];
    userId?: string;
    busy: boolean;
    loading: boolean;
  },
): BottomNavigation {
  const path = pathname.replace(/\/+$/, "") || "/";
  const standard: BottomNavigation = {
    visible: true,
    addHref: "/trip/new",
    addDisabled: false,
  };
  if (MAIN_SCREENS.some((name) => path === `/${name}`) || path === "/friends")
    return standard;

  const match = /^\/trip\/([^/]+)\/([^/]+)$/.exec(path);
  if (!match) return { ...standard, visible: false };
  const [, tripId, section] = match;
  if (section === "edit" || section === "chat")
    return { ...standard, visible: false };
  if (section === "manage") return standard;

  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip) return { ...standard, visible: false };
  const kind = Object.hasOwn(createKinds, section)
    ? createKinds[section as keyof typeof createKinds]
    : createKinds.overview;
  const unavailable = trip.archived || state.busy || state.loading;
  return {
    visible: true,
    addHref: {
      pathname: "/trip/[tripId]/edit",
      params: { tripId: trip.id, kind },
    },
    addDisabled:
      (kind === "checklist" && unavailable) ||
      (kind === "notices" && (trip.ownerId !== state.userId || unavailable)),
  };
}
