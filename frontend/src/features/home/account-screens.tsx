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
  Icon,
  Section,
  styles as s,
} from "../../ui/components";
import { Confirm, Page } from "../../ui/shell";
import { palette as p } from "../../ui/theme";
import { tripHref } from "./home-screen";
import { UserSettings } from "./user-settings";
import { TripInvitations } from "./invitation-panels";

export { FriendsScreen } from "./friends-screen";

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
