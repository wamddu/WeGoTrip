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

export function FriendsScreen() {
  const { data, session, execute, busy } = useTravel();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const friends = data?.friendships[session!.user.id] ?? [];
  const matches =
    data?.users.filter(
      (u) =>
        u.id !== session!.user.id &&
        (search
          ? `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
          : friends.includes(u.id)),
    ) ?? [];
  return (
    <Page title="함께 떠날 친구" back>
      <Field
        title="이름 또는 이메일 검색"
        value={search}
        onChangeText={setSearch}
        placeholder="친구를 찾아보세요"
      />
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
                <Badge>친구</Badge>
              ) : (
                <Button
                  title="추가"
                  secondary
                  disabled={busy}
                  onPress={() => {
                    void execute({ type: "friend.add", userId: u.id }).catch(
                      (e) => setError(e.message),
                    );
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
          description="등록된 이름이나 이메일로 검색할 수 있어요."
        />
      )}
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
      <Button
        title="친구 관리"
        secondary
        icon="users"
        onPress={() => router.push("/friends")}
      />
      <View style={{ height: 12 }} />
      <Button
        title="내 여행 모두 보기"
        secondary
        icon="trips"
        onPress={() => router.push("/trips")}
      />
      <Section title="앱 정보" />
      <Card>
        <Text style={s.strong}>WeGoTrip · 함께 만드는 여행</Text>
        <Text style={s.body}>
          {mode === "mock"
            ? "로컬 데이터 모드가 활성화되어 있어요. 변경한 내용은 이 기기에 저장됩니다. 다른 기기와는 아직 동기화되지 않아요."
            : "서버 데이터 모드가 활성화되어 있어요."}
        </Text>
        <Text style={s.small}>
          일정의 지도 동선에서 방문 순서를 확인할 수 있어요. 실시간 위치·영수증
          인식·AI 도우미는 후속 연결 기능입니다.
        </Text>
      </Card>
      <ErrorMessage message={error} />
      <View style={{ marginTop: 25 }}>
        <Button
          title="로그아웃"
          secondary
          icon="logout"
          onPress={() => setConfirm(true)}
          disabled={busy}
        />
      </View>
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
      {!notifications.length && (
        <Empty
          title="아직 새로운 소식이 없어요"
          description="일정 변경이나 새 공지가 생기면 여기서 알려드릴게요."
        />
      )}
    </Page>
  );
}
