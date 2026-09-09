import type { Workspace } from "../domain/models";
import { createSeedWorkspace } from "./fixtures/workspace";

/** Backfill only unchanged seed places; never geocode or overwrite the user's locations. */
export function addSeedCoordinates(data: Workspace): Workspace {
  const seeds = createSeedWorkspace().trips;
  return {
    ...data,
    trips: data.trips.map((trip) => {
      const seed = seeds.find((t) => t.id === trip.id);
      return {
        ...trip,
        places: trip.places.map((place) => {
          if (place.coordinates !== undefined) return place;
          const original = seed?.places.find(
            (p) =>
              p.id === place.id &&
              p.name === place.name &&
              p.address === place.address,
          );
          return original?.coordinates
            ? { ...place, coordinates: { ...original.coordinates } }
            : place;
        }),
      };
    }),
  };
}
