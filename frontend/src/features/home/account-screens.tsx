import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTravel } from "../../state/travel-provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorMessage,
  Field,
  Icon,
  Section,
  styles as s,
} from "../../ui/components";
import { Confirm, Page } from "../../ui/shell";
import { palette as p } from "../../ui/theme";
import { tripHref } from "./home-screen";
import { UserSettings } from "./user-settings";
import { FriendRequests, TripInvitations } from "./invitation-panels";
import type { User } from "../../domain/models";

export function FriendsScreen() {
  const { data, session, execute, busy, tripApi, refresh } = useTravel();
  const [found, setFound] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const friends = data?.friendships[session!.user.id] ?? [];
  const matches =
    tripApi && found
      ? [found]
      : (data?.users.filter(
          (u) =>
            u.id !== session!.user.id &&
            (search
              ? `${u.name} ${u.email}`
                  .toLowerCase()
                  .includes(search.toLowerCase())
              : friends.includes(u.id)),
        ) ?? []);
  return (
    <Page title="함께 떠날 친구" back>
      <Field
        title={tripApi ? "친구 이름 또는 가입 이메일" : "이름 또는 이메일 검색"}
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setFound(null);
          setMessage("");
        }}
        placeholder="친구를 찾아보세요"
        editable={!searching}
      />
      {tripApi && (
        <Button
          title="이메일로 회원 찾기"
          loading={searching}
          onPress={() => {
            setSearching(true);
            setError("");
            setFound(null);
            void tripApi
              .lookup(search.trim())
              .then(({ user }) => {
                setFound(
                  user ? { ...user, email: "", color: "#D8ECFF" } : null,
                );
                if (!user) setMessage("해당 이메일의 회원을 찾을 수 없어요.");
              })
              .catch((e) => setError(e.message))
              .finally(() => setSearching(false));
          }}
        />
      )}
      {!!message && <Text style={s.small}>{message}</Text>}
      <ErrorMessage message={error} />
      {matches.map((u) => (
        <View key={u.id} style={{ marginBottom: 12 }}>
          <Card>
            <View style={s.row}>
              <Avatar user={u} size={42} />
              <View style={s.flex}>
                <Text style={s.strong}>{u.name}</Text>
                <Text style={s.small}>{u.email}</Text>
              </View>
              {friends.includes(u.id) ? (
                <View style={s.wrap}>
                  <Badge>친구</Badge>
                  {tripApi && (
                    <Button
                      title="친구 삭제"
                      secondary
                      disabled={busy || searching}
                      onPress={() => setRemove(u)}
                    />
                  )}
                </View>
              ) : (
                <Button
                  title={tripApi ? "친구 요청" : "추가"}
                  secondary
                  disabled={busy}
                  onPress={() => {
                    void execute({ type: "friend.add", userId: u.id })
                      .then(() => {
                        setRevision((v) => v + 1);
                        if (tripApi)
                          setMessage(
                            "친구 요청을 보냈어요. 상대방 수락 후 친구로 표시됩니다.",
                          );
                      })
                      .catch((e) => setError(e.message));
                  }}
                />
              )}
            </View>
          </Card>
        </View>
      ))}
      {!matches.length && (
        <Empty
          title="친구를 찾아보세요"
          description={
            tripApi
              ? "친구 목록은 이름으로, 새 친구는 가입 이메일 전체로 찾을 수 있어요."
              : "등록된 이름이나 이메일로 검색할 수 있어요."
          }
        />
      )}
      <FriendRequests revision={revision} />
      <Confirm
        visible={!!remove}
        title="친구 관계를 삭제할까요?"
        description="함께하는 여행방은 유지돼요."
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          const target = remove;
          setRemove(null);
          if (target && tripApi)
            void tripApi
              .removeFriend(target.id)
              .then(() => refresh())
              .catch((e) => setError(e.message));
        }}
      />
    </Page>
  );
}
export function ProfileScreen() {
  const { session, mode, signOut, busy } = useTravel();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  return (
    <Page title="내 정보">
      <Card>
        <View style={s.row}>
          <Avatar user={session?.user} size={60} />
          <View style={s.flex}>
            <Text style={s.title}>{session?.user.name}</Text>
            <Text style={s.body}>{session?.user.email}</Text>
          </View>
        </View>
      </Card>
      <Section title="나의 여행 생활" />
      <Card>
        <Button
          title="친구 관리"
          secondary
          icon="users"
          onPress={() => router.push("/friends")}
        />
      </Card>
      {mode === "http" && <UserSettings />}
      <ErrorMessage message={error} />
      <Section title="로그인 관리" />
      <Card>
        <Button
          title="로그아웃"
          secondary
          icon="logout"
          onPress={() => setConfirm(true)}
          disabled={busy}
        />
      </Card>
      <Confirm
        visible={confirm}
        title="로그아웃할까요?"
        description="저장된 여행 데이터는 유지됩니다."
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          void signOut()
            .then(() => router.replace("/login"))
            .catch((e) => {
              setConfirm(false);
              setError(e.message);
            });
        }}
      />
    </Page>
  );
}
export function NotificationsScreen() {
  const { data, execute, busy } = useTravel();
  const [error, setError] = useState("");
  const notifications = data?.notifications ?? [];
  const allowedSections = [
    "overview",
    "schedule",
    "places",
    "expenses",
    "checklist",
    "notices",
    "chat",
  ];
  return (
    <Page title="알림" subtitle="함께하는 여행의 새로운 소식" refresh>
      <ErrorMessage message={error} />
      {notifications.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel={n.title}
          disabled={busy}
          onPress={async () => {
            try {
              await execute({
                type: "notification.read",
                notificationId: n.id,
              });
              router.push(
                tripHref(
                  n.tripId,
                  allowedSections.includes(n.section) ? n.section : "overview",
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          style={{ marginBottom: 13 }}
        >
          <Card>
            <View style={s.row}>
              <Icon name="bell" color={n.read ? p.secondary : p.primary} />
              <View style={s.flex}>
                <Text style={s.strong}>{n.title}</Text>
                <Text style={s.small}>{n.body}</Text>
              </View>
              {!n.read && <Badge>NEW</Badge>}
            </View>
          </Card>
        </Pressable>
      ))}
      <TripInvitations />
      {!notifications.length && (
        <Empty
          title="아직 새로운 소식이 없어요"
          description="일정 변경이나 새 공지가 생기면 여기서 알려드릴게요."
        />
      )}
    </Page>
  );
}
