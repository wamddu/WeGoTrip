import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { User } from "../../domain/models";
import { useTravel } from "../../state/travel-provider";
import {
  Avatar,
  Badge,
  Button,
  ErrorMessage,
  Icon,
  styles as s,
} from "../../ui/components";
import { Confirm, Page } from "../../ui/shell";
import { palette as p } from "../../ui/theme";
import { FriendRequests } from "./invitation-panels";
import { f, FriendEmpty, FriendTabs } from "./friends-ui";

export function FriendsScreen() {
  const { data, session, execute, busy, tripApi, refresh } = useTravel();
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<User | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [remove, setRemove] = useState<User | null>(null);
  const lock = useRef(false);
  const ids = data?.friendships[session!.user.id] ?? [];
  const friends = data?.users.filter((u) => ids.includes(u.id)) ?? [];
  const query = search.trim().toLowerCase();
  const matches = friends.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(query),
  );
  const candidates = tripApi
    ? found
      ? [found]
      : []
    : email.trim()
      ? (data?.users.filter(
          (u) =>
            u.id !== session!.user.id &&
            `${u.name} ${u.email}`
              .toLowerCase()
              .includes(email.trim().toLowerCase()),
        ) ?? [])
      : [];

  async function lookup() {
    if (!tripApi || searching || !email.trim()) return;
    setSearching(true);
    setError("");
    setFound(null);
    setSearched(false);
    try {
      const { user } = await tripApi.lookup(email.trim());
      setFound(user ? { ...user, email: "", color: p.blueSoft } : null);
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function add(user: User) {
    if (lock.current) return;
    lock.current = true;
    setPending(user.id);
    setError("");
    setMessage("");
    try {
      await execute({ type: "friend.add", userId: user.id });
      setRevision((v) => v + 1);
      if (tripApi) setSent((items) => [...items, user.id]);
      setMessage(
        tripApi
          ? `${user.name}님에게 친구 요청을 보냈어요. 수락하면 친구 목록에 표시돼요.`
          : `${user.name}님과 친구가 되었어요.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <Page title="친구 관리" back>
      <View style={f.hero}>
        <View style={f.heroIcon}>
          <Icon name="users" size={48} color={p.primary} />
        </View>
        <Text style={f.eyebrow}>TRAVEL TOGETHER</Text>
        <Text style={f.heroTitle}>{"좋은 여행은,\n좋은 친구와 함께."}</Text>
        <Text style={s.body}>함께 떠나고 싶은 친구를 만나보세요.</Text>
        <View style={{ alignSelf: "flex-start" }}>
          <Badge background={p.white}>나의 여행 친구 {friends.length}명</Badge>
        </View>
      </View>
      {tripApi && (
        <FriendTabs<"friends" | "requests">
          value={tab}
          onChange={setTab}
          items={[
            { value: "friends", label: `내 친구 ${friends.length}` },
            { value: "requests", label: "친구 요청" },
          ]}
        />
      )}
      <ErrorMessage message={error} />
      {!!message && (
        <View style={f.feedback}>
          <Text
            accessibilityLiveRegion="polite"
            style={[s.body, { color: p.ink }]}
          >
            {message}
          </Text>
        </View>
      )}
      {tab === "requests" && tripApi ? (
        <FriendRequests
          revision={revision}
          onCancelled={(id) => {
            setSent((items) => items.filter((userId) => userId !== id));
            setMessage("");
          }}
        />
      ) : (
        <>
          <View style={f.panel}>
            <View style={s.row}>
              <View
                style={[
                  f.emptyIcon,
                  { width: 40, height: 40, borderRadius: 13, marginBottom: 0 },
                ]}
              >
                <Icon name="plus" color={p.primary} size={21} />
              </View>
              <View style={s.flex}>
                <Text style={s.strong}>새로운 친구 추가</Text>
                <Text style={s.small}>
                  {tripApi
                    ? "친구가 가입한 이메일로 찾아보세요."
                    : "친구의 이름이나 이메일로 찾아보세요."}
                </Text>
              </View>
            </View>
            <View style={f.search}>
              <Icon name="search" size={20} color={p.secondary} />
              <TextInput
                accessibilityLabel={
                  tripApi ? "친구 가입 이메일" : "새 친구 이름 또는 이메일"
                }
                placeholder={
                  tripApi ? "friend@example.com" : "이름 또는 이메일"
                }
                placeholderTextColor={p.secondary}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setFound(null);
                  setSearched(false);
                  setError("");
                }}
                style={f.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={tripApi ? "email-address" : "default"}
                editable={!searching}
                returnKeyType="search"
                onSubmitEditing={() => void lookup()}
              />
            </View>
            {tripApi && (
              <Button
                title="친구 찾기"
                icon="search"
                onPress={() => void lookup()}
                loading={searching}
                disabled={!email.trim()}
              />
            )}
            {searched && !found && (
              <Text style={s.body}>
                해당 이메일로 가입한 친구가 없어요. 이메일을 다시 확인해 주세요.
              </Text>
            )}
            {candidates.map((user) => (
              <View key={user.id} style={{ gap: 12 }}>
                <View style={s.row}>
                  <Avatar user={user} size={44} />
                  <View style={s.flex}>
                    <Text style={s.strong} numberOfLines={1}>
                      {user.name}
                    </Text>
                    <Text style={s.small}>
                      {user.id === session!.user.id
                        ? "내 프로필"
                        : ids.includes(user.id)
                          ? "이미 함께하는 친구예요"
                          : "함께 여행할 친구를 찾았어요"}
                    </Text>
                  </View>
                </View>
                {user.id !== session!.user.id && !ids.includes(user.id) && (
                  <Button
                    title={
                      sent.includes(user.id)
                        ? "요청 보냄"
                        : tripApi
                          ? "친구 요청 보내기"
                          : "친구 추가"
                    }
                    icon={sent.includes(user.id) ? "check" : "plus"}
                    secondary
                    disabled={busy || !!pending || sent.includes(user.id)}
                    loading={pending === user.id}
                    onPress={() => void add(user)}
                  />
                )}
              </View>
            ))}
          </View>
          <View style={f.heading}>
            <Text style={s.sectionTitle}>
              내 친구 <Text style={{ color: p.primary }}>{friends.length}</Text>
            </Text>
            <Text style={s.small}>함께할 다음 여행이 기대돼요</Text>
          </View>
          {friends.length > 0 && (
            <View
              style={[f.search, { backgroundColor: p.white, marginBottom: 14 }]}
            >
              <Icon name="search" size={20} color={p.secondary} />
              <TextInput
                accessibilityLabel="내 친구 검색"
                placeholder="친구 이름으로 검색"
                placeholderTextColor={p.secondary}
                value={search}
                onChangeText={setSearch}
                style={f.input}
                autoCorrect={false}
              />
              {!!search && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="검색 지우기"
                  onPress={() => setSearch("")}
                  style={f.quietAction}
                >
                  <Icon name="close" size={18} color={p.secondary} />
                </Pressable>
              )}
            </View>
          )}
          {matches.length > 0 ? (
            <View style={f.list}>
              {matches.map((user, index) => {
                const shared =
                  data?.trips.filter(
                    (trip) =>
                      trip.memberIds.includes(user.id) &&
                      trip.memberIds.includes(session!.user.id),
                  ).length ?? 0;
                return (
                  <View
                    key={user.id}
                    style={[f.person, index > 0 && f.divider]}
                  >
                    <Avatar user={user} size={48} />
                    <View style={s.flex}>
                      <Text style={s.strong} numberOfLines={1}>
                        {user.name}
                      </Text>
                      <Text style={s.small} numberOfLines={1}>
                        {shared
                          ? `함께하는 여행 ${shared}개`
                          : "새로운 여행을 함께 계획해 보세요"}
                      </Text>
                    </View>
                    {tripApi && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${user.name}님 친구 삭제`}
                        disabled={busy || !!pending}
                        onPress={() => setRemove(user)}
                        style={({ pressed }) => [
                          f.quietAction,
                          pressed && { opacity: 0.5 },
                        ]}
                      >
                        <Icon name="trash" size={19} color={p.secondary} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <FriendEmpty
              title={query ? "검색 결과가 없어요" : "첫 여행 친구를 만나보세요"}
            >
              {query
                ? "다른 이름으로 검색해 보세요."
                : "위에서 친구를 찾아 추가하면\n함께할 여행을 더 쉽게 준비할 수 있어요."}
            </FriendEmpty>
          )}
        </>
      )}
      <Confirm
        visible={!!remove}
        title={`${remove?.name ?? "친구"}님을 친구에서 삭제할까요?`}
        description="친구 목록에서 삭제돼요. 함께하는 여행방은 유지됩니다."
        busy={!!pending}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove || !tripApi || lock.current) return;
          lock.current = true;
          setPending(remove.id);
          setError("");
          void tripApi
            .removeFriend(remove.id)
            .then(() => refresh())
            .then(() => setRemove(null))
            .catch((e) => {
              setRemove(null);
              setError(e.message);
            })
            .finally(() => {
              lock.current = false;
              setPending(null);
            });
        }}
      />
    </Page>
  );
}
