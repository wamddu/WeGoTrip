import { useLocalSearchParams } from "expo-router";
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import { useTravel } from "../../state/travel-provider";
const Context = createContext<{
  date: string;
  setDate(value: string): void;
  partyId: string | null;
  setPartyId(value: string | null): void;
} | null>(null);
export function TripProvider({ children }: PropsWithChildren) {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { data } = useTravel();
  const trip = data?.trips.find((t) => t.id === tripId);
  const [selectedDate, setDate] = useState("");
  const [partyId, setPartyId] = useState<string | null>(null);
  const date =
    selectedDate >= (trip?.startDate ?? "") &&
    selectedDate <= (trip?.endDate ?? "")
      ? selectedDate
      : (trip?.startDate ?? "");
  return (
    <Context.Provider
      value={{
        date,
        setDate,
        partyId: trip?.parties.some((p) => p.id === partyId) ? partyId : null,
        setPartyId,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTrip() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const state = useTravel();
  const filters = useContext(Context);
  if (!filters) throw new Error("TripProvider is missing");
  return {
    ...state,
    ...filters,
    trip: state.data?.trips.find((t) => t.id === tripId),
  };
}
