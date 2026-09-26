import { useCallback, useRef, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useTravel } from "../../state/travel-provider";
import type { FriendRequest, Invitation } from "../../data/trip-api";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ErrorMessage,
  Section,
  styles as s,
} from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { f, FriendEmpty, FriendTabs } from "./friends-ui";
import { tripHref } from "./home-screen";

// These are sections of the original screens; they do not replace pages or navigation.
export function FriendRequests({
  revision = 0,
  onCancelled,
}: {
  revision?: number;
  onCancelled?(userId: string): void;
}) {
  const { tripApi, refresh } = useTravel();
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [status, setStatus] = useState("PENDING"),
    [items, setItems] = useState<FriendRequest[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!tripApi) return;
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await tripApi.requests(direction, status);
      if (current === generation.current) setItems(next);
    } catch (e) {
      if (current === generation.current) {
        setItems([]);
        setError((e as Error).message);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [tripApi, direction, status, revision]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );
  async function decide(id: string, action: "accept" | "decline" | "cancel") {
    if (lock.current || !tripApi) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await tripApi.decideFriend(id, action);
      if (action === "cancel") {
        const item = items.find((request) => request.id === id);
        if (item) onCancelled?.(item.recipient.id);
      }
      setNotice(
        action === "accept"
          ? "친구가 되었어요! 내 친구 목록에서 확인해 보세요."
          : action === "decline"
            ? "친구 요청을 거절했어요."
            : "보낸 요청을 취소했어요.",
      );
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
  const labels: Record<string, string> = {
    PENDING: "대기 중",
    ACCEPTED: "수락됨",
    DECLINED: "거절됨",
    CANCELLED: "취소됨",
  };
  return (
    <>
      <View style={f.heading}>
        <View style={s.flex}>
          <Text style={s.sectionTitle}>친구 요청함</Text>
          <Text style={s.small}>새로운 친구의 인사를 확인해 보세요.</Text>
        </View>
        <Button
          title="새로고침"
          secondary
          disabled={busy || loading}
          onPress={() => void load()}
        />
      </View>
      <FriendTabs<"received" | "sent">
        value={direction}
        disabled={busy}
        onChange={(value) => {
          if (value !== direction) {
            setDirection(value);
            setItems([]);
            setLoading(true);
            setNotice("");
          }
        }}
        items={[
          { value: "received", label: "받은 요청" },
          { value: "sent", label: "보낸 요청" },
        ]}
      />
      <View style={[s.wrap, { marginBottom: 6 }]}>
        {Object.entries(labels).map(([value, label]) => (
          <Chip
            key={value}
            title={label}
            active={status === value}
            onPress={() => {
              if (!busy && value !== status) {
                setStatus(value);
                setItems([]);
                setLoading(true);
                setNotice("");
              }
            }}
          />
        ))}
      </View>
      {!!notice && (
        <View style={[f.feedback, { marginTop: 12 }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.body, { color: p.ink }]}
          >
            {notice}
          </Text>
        </View>
      )}
      <ErrorMessage message={error} />
      {loading ? (
        <View style={{ padding: 32, alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={p.primary} />
          <Text style={s.small}>친구 요청을 불러오고 있어요</Text>
        </View>
      ) : (
        items.map((item) => {
          const user =
            direction === "received" ? item.requester : item.recipient;
          return (
            <View key={item.id} style={f.request}>
              <View style={s.row}>
                <Avatar
                  user={{
                    ...user,
                    email: "",
                    color: direction === "received" ? p.blueSoft : p.purpleSoft,
                  }}
                  size={48}
                />
                <View style={s.flex}>
                  <Text style={s.strong} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <Text style={s.small}>
                    {item.status === "PENDING"
                      ? direction === "received"
                        ? "친구가 되고 싶어 해요"
                        : "수락을 기다리고 있어요"
                      : "친구 요청 내역"}
                  </Text>
                </View>
                <Badge
                  color={item.status === "ACCEPTED" ? "#18756C" : p.secondary}
                  background={item.status === "ACCEPTED" ? p.mintSoft : p.bg}
                >
                  {labels[item.status] ?? item.status}
                </Badge>
              </View>
              {item.status === "PENDING" && (
                <View style={f.actions}>
                  {direction === "received" ? (
                    <>
                      <View style={{ flex: 1 }}>
                        <Button
                          title="거절"
                          secondary
                          disabled={busy}
                          onPress={() => void decide(item.id, "decline")}
                        />
                      </View>
                      <View style={{ flex: 2 }}>
                        <Button
                          title="수락하기"
                          icon="check"
                          disabled={busy}
                          onPress={() => void decide(item.id, "accept")}
                        />
                      </View>
                    </>
                  ) : (
                    <View style={s.flex}>
                      <Button
                        title="요청 취소"
                        secondary
                        disabled={busy}
                        onPress={() => void decide(item.id, "cancel")}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
      {!loading && !error && !items.length && (
        <View style={{ marginTop: 16 }}>
          <FriendEmpty
            icon={direction === "received" ? "bell" : "send"}
            title={
              status === "PENDING"
                ? direction === "received"
                  ? "새로운 친구 요청이 없어요"
                  : "대기 중인 요청이 없어요"
                : `${labels[status]} 요청이 없어요`
            }
          >
            {direction === "received"
              ? "친구 요청이 도착하면 이곳에서 확인하고 함께할 여행을 시작할 수 있어요."
              : "내 친구 탭에서 친구를 찾아 먼저 반가운 인사를 보내보세요."}
          </FriendEmpty>
        </View>
      )}
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
