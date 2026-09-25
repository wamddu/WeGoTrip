import { useCallback, useRef, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { Text, View } from "react-native";
import { useTravel } from "../../state/travel-provider";
import type { FriendRequest, Invitation } from "../../data/trip-api";
import {
  Button,
  Card,
  Chip,
  ErrorMessage,
  Section,
  styles as s,
} from "../../ui/components";
import { tripHref } from "./home-screen";

// These are sections of the original screens; they do not replace pages or navigation.
export function FriendRequests({ revision = 0 }: { revision?: number }) {
  const { tripApi, refresh } = useTravel();
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [status, setStatus] = useState("PENDING"),
    [items, setItems] = useState<FriendRequest[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    if (tripApi) setItems(await tripApi.requests(direction, status));
  }, [tripApi, direction, status, revision]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
  async function decide(id: string, action: "accept" | "decline" | "cancel") {
    if (lock.current || !tripApi) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await tripApi.decideFriend(id, action);
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!tripApi) return null;
  return (
    <>
      <Section
        title="친구 요청"
        action="새로고침"
        onPress={() => void load().catch((e) => setError(e.message))}
      />
      <View style={s.wrap}>
        {(["received", "sent"] as const).map((value) => (
          <Chip
            key={value}
            title={value === "received" ? "받은 요청" : "보낸 요청"}
            active={direction === value}
            onPress={() => {
              if (!busy) setDirection(value);
            }}
          />
        ))}
      </View>
      <View style={s.wrap}>
        {[
          ["PENDING", "대기"],
          ["ACCEPTED", "수락됨"],
          ["DECLINED", "거절됨"],
          ["CANCELLED", "취소됨"],
        ].map(([value, label]) => (
          <Chip
            key={value}
            title={label}
            active={status === value}
            onPress={() => {
              if (!busy) setStatus(value);
            }}
          />
        ))}
      </View>
      {items.map((item) => (
        <Card key={item.id}>
          <Text style={s.strong}>
            {direction === "received"
              ? item.requester.name
              : item.recipient.name}
          </Text>
          {item.status === "PENDING" && (
            <View style={s.wrap}>
              {(direction === "received"
                ? (["accept", "decline"] as const)
                : (["cancel"] as const)
              ).map((action) => (
                <Button
                  key={action}
                  title={
                    action === "accept"
                      ? "친구 요청 수락"
                      : action === "decline"
                        ? "친구 요청 거절"
                        : "친구 요청 취소"
                  }
                  secondary
                  disabled={busy}
                  onPress={() => void decide(item.id, action)}
                />
              ))}
            </View>
          )}
        </Card>
      ))}
      {!items.length && (
        <Text style={s.small}>해당하는 친구 요청이 없어요.</Text>
      )}
      <ErrorMessage message={error} />
    </>
  );
}
export function TripInvitations({
  tripId,
  revision = 0,
}: {
  tripId?: string;
  revision?: number;
}) {
  const { tripApi, refresh } = useTravel();
  const [status, setStatus] = useState("PENDING"),
    [items, setItems] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    if (tripApi) setItems(await tripApi.invitations(tripId, status));
  }, [tripApi, tripId, status, revision]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
  async function decide(id: string, action: "accept" | "decline" | "cancel") {
    if (lock.current || !tripApi) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await tripApi.decideInvitation(id, action);
      await load();
      await refresh();
      if (action === "accept" && result.tripId)
        router.push(tripHref(result.tripId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!tripApi) return null;
  return (
    <>
      <Section
        title={tripId ? "보낸 여행 초대" : "받은 여행 초대"}
        action="새로고침"
        onPress={() => void load().catch((e) => setError(e.message))}
      />
      <View style={s.wrap}>
        {[
          ["PENDING", "대기"],
          ["ACCEPTED", "수락됨"],
          ["DECLINED", "거절됨"],
          ["CANCELLED", "취소됨"],
          ["EXPIRED", "만료"],
        ].map(([value, label]) => (
          <Chip
            key={value}
            title={label}
            active={status === value}
            onPress={() => {
              if (!busy) setStatus(value);
            }}
          />
        ))}
      </View>
      {items.map((item) => (
        <Card key={item.id}>
          <Text style={s.strong}>
            {tripId ? item.invitee.name : item.trip.title}
          </Text>
          <Text style={s.small}>
            {item.inviter.name}님의 초대 · {item.trip.destination} ·{" "}
            {item.trip.startDate} ~ {item.trip.endDate}
          </Text>
          <Text style={s.small}>
            만료: {new Date(item.expiresAt).toLocaleString("ko-KR")}
          </Text>
          {item.status === "PENDING" && (
            <View style={s.wrap}>
              {(tripId
                ? (["cancel"] as const)
                : (["accept", "decline"] as const)
              ).map((action) => (
                <Button
                  key={action}
                  title={
                    action === "accept"
                      ? "수락하고 참여"
                      : action === "decline"
                        ? "초대 거절"
                        : "초대 취소"
                  }
                  disabled={busy}
                  secondary
                  onPress={() => void decide(item.id, action)}
                />
              ))}
            </View>
          )}
        </Card>
      ))}
      {!items.length && (
        <Text style={s.small}>해당하는 여행 초대가 없어요.</Text>
      )}
      <ErrorMessage message={error} />
    </>
  );
}
