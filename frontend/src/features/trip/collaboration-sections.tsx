import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { uid } from "../../domain/models";
import {
  Avatar,
  Badge,
  Card,
  Chip,
  Empty,
  ErrorMessage,
  Icon,
  Section,
  styles as s,
} from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { editHref } from "./shared";
import { useTrip } from "./trip-context";
import { tripHref } from "../home/home-screen";

export function ChecklistSection() {
  const { trip: t, data, session, execute, busy } = useTrip();
  const trip = t!;
  const [filter, setFilter] = useState("전체");
  const [error, setError] = useState("");
  const list = trip.checklist.filter(
    (c) =>
      filter === "전체" ||
      (filter === "내 준비물" ? c.ownerId === session!.user.id : !c.done),
  );
  const completed = trip.checklist.filter((c) => c.done).length;
  return (
    <>
      <Card>
        <View style={s.between}>
          <Text style={s.sectionTitle}>하나씩, 빠짐없이</Text>
          <Badge>
            {completed} / {trip.checklist.length}
          </Badge>
        </View>
        <View style={st.progress}>
          <View
            style={[
              st.progressFill,
              {
                width: `${trip.checklist.length ? (completed / trip.checklist.length) * 100 : 0}%`,
              },
            ]}
          />
        </View>
        <Text style={s.small}>함께 챙기면 준비도 더 가벼워져요.</Text>
      </Card>
      <View style={[s.wrap, { marginTop: 20 }]}>
        {["전체", "내 준비물", "미완료"].map((v) => (
          <Chip
            key={v}
            title={v}
            active={filter === v}
            onPress={() => setFilter(v)}
          />
        ))}
      </View>
      <Section
        title="여행 준비물"
        action="항목 추가"
        onPress={() => router.push(editHref(trip.id, "checklist"))}
      />
      <ErrorMessage message={error} />
      {list.map((item) => (
        <View style={st.checkRow} key={item.id}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={item.title}
            accessibilityState={{ checked: item.done }}
            aria-checked={item.done}
            disabled={busy || trip.archived}
            onPress={() => {
              void execute({
                type: "item.save",
                tripId: trip.id,
                collection: "checklist",
                item: { ...item, done: !item.done },
              }).catch((e) => setError(e.message));
            }}
            style={[s.row, s.flex, { minHeight: 53 }]}
          >
            <View
              style={[
                st.checkbox,
                item.done && {
                  backgroundColor: p.primary,
                  borderColor: p.primary,
                },
              ]}
            >
              {item.done && <Icon name="check" size={14} color={p.white} />}
            </View>
            <View style={s.flex}>
              <Text
                style={[
                  s.strong,
                  item.done && {
                    textDecorationLine: "line-through",
                    color: p.secondary,
                  },
                ]}
              >
                {item.title}
              </Text>
              <Text style={s.small}>
                {data!.users.find((u) => u.id === item.ownerId)?.name ??
                  "공용 준비물"}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 수정`}
            onPress={() => router.push(editHref(trip.id, "checklist", item.id))}
            style={s.iconButton}
          >
            <Icon name="edit" size={19} color={p.secondary} />
          </Pressable>
        </View>
      ))}
      {!list.length && (
        <Empty
          title="확인할 준비물이 없어요"
          description="준비물을 추가하거나 다른 필터를 선택해 보세요."
        />
      )}
    </>
  );
}
export function NoticesSection() {
  const { trip: t, data, session } = useTrip();
  const trip = t!;
  const notices = [...trip.notices].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <>
      <Section
        title="함께 알아두면 좋은 소식"
        action="공지 작성"
        onPress={() => router.push(editHref(trip.id, "notices"))}
      />
      {notices.map((n) => (
        <View key={n.id} style={{ marginBottom: 16 }}>
          <Card>
            <View style={s.between}>
              {n.pinned ? (
                <Badge color={p.coral} background={p.coralSoft}>
                  고정 공지
                </Badge>
              ) : (
                <Badge>공지</Badge>
              )}
              {(n.authorId === session!.user.id ||
                trip.ownerId === session!.user.id) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${n.title} 수정`}
                  onPress={() =>
                    router.push(editHref(trip.id, "notices", n.id))
                  }
                  style={s.iconButton}
                >
                  <Icon name="edit" size={20} color={p.secondary} />
                </Pressable>
              )}
            </View>
            <Text style={s.sectionTitle}>{n.title}</Text>
            <Text style={s.body}>{n.body}</Text>
            <Text style={s.small}>
              {data!.users.find((u) => u.id === n.authorId)?.name} ·{" "}
              {n.createdAt.slice(0, 10)}
            </Text>
          </Card>
        </View>
      ))}
      {!notices.length && (
        <Empty
          title="아직 작성한 공지가 없어요"
          description="집합 장소나 꼭 알아둘 내용을 남겨 보세요."
        />
      )}
    </>
  );
}
export function ChatSection() {
  const { trip: t, data, session } = useTrip();
  const trip = t!;
  const pinned = trip.notices.find((n) => n.pinned);
  return (
    <>
      {pinned && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대화방 고정 공지"
          onPress={() => router.push(tripHref(trip.id, "notices"))}
          style={{ marginBottom: 18 }}
        >
          <Card>
            <View style={s.row}>
              <Icon name="notice" color={p.coral} />
              <View style={s.flex}>
                <Text style={s.small}>고정 공지</Text>
                <Text style={s.strong}>{pinned.title}</Text>
              </View>
            </View>
          </Card>
        </Pressable>
      )}
      <Text style={[s.small, { textAlign: "center", marginBottom: 20 }]}>
        여행 멤버 {trip.memberIds.length}명과 함께하는 대화
      </Text>
      {trip.messages.map((m, i) => {
        const mine = m.authorId === session!.user.id;
        const author = data!.users.find((u) => u.id === m.authorId);
        const date = new Date(m.createdAt);
        const day = date.toLocaleDateString("ko-KR");
        const previous =
          i > 0
            ? new Date(trip.messages[i - 1].createdAt).toLocaleDateString(
                "ko-KR",
              )
            : "";
        return (
          <View key={m.id}>
            {day !== previous && <Text style={st.date}>{day}</Text>}
            <View
              style={[st.messageRow, mine && { flexDirection: "row-reverse" }]}
            >
              {!mine && <Avatar user={author} />}
              <View
                style={[st.messageColumn, mine && { alignItems: "flex-end" }]}
              >
                {!mine && <Text style={s.small}>{author?.name}</Text>}
                <View style={[st.bubble, mine && st.mine]}>
                  <Text style={[st.messageText, mine && { color: p.white }]}>
                    {m.text}
                  </Text>
                </View>
                <Text style={st.timestamp}>
                  {date.toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
      {!trip.messages.length && (
        <Empty
          title="첫 인사를 나눠 보세요"
          description="여행에서 하고 싶은 이야기를 남겨 주세요."
        />
      )}
    </>
  );
}
export function ChatComposer() {
  const { trip, session, execute, busy } = useTrip();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  async function send() {
    if (!text.trim() || busy || !trip) return;
    try {
      await execute({
        type: "item.save",
        tripId: trip.id,
        collection: "messages",
        item: {
          id: uid(),
          text: text.trim(),
          authorId: session!.user.id,
          createdAt: new Date().toISOString(),
        },
      });
      setText("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={st.composerWrap}>
      <ErrorMessage message={error} />
      <View style={st.composer}>
        <TextInput
          accessibilityLabel="메시지 입력"
          editable={!trip?.archived}
          value={text}
          onChangeText={setText}
          placeholder={
            trip?.archived ? "종료한 여행이에요" : "여행 이야기를 나눠 보세요"
          }
          placeholderTextColor={p.secondary}
          style={st.messageInput}
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="메시지 보내기"
          disabled={!text.trim() || busy || trip?.archived}
          onPress={() => void send()}
          style={[st.send, (!text.trim() || busy) && { opacity: 0.4 }]}
        >
          <Icon name="send" color={p.white} />
        </Pressable>
      </View>
    </View>
  );
}
const st = StyleSheet.create({
  progress: {
    height: 6,
    backgroundColor: p.border,
    borderRadius: 6,
    overflow: "hidden",
    marginVertical: 10,
  },
  progressFill: { height: 6, backgroundColor: p.mint, borderRadius: 6 },
  checkRow: {
    padding: 13,
    backgroundColor: p.white,
    marginBottom: 10,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: p.border,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#BBCCDF",
    alignItems: "center",
    justifyContent: "center",
  },
  date: {
    fontSize: 10,
    color: p.secondary,
    alignSelf: "center",
    backgroundColor: "#E9EFF6",
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 15,
    marginBottom: 24,
  },
  messageRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 22,
    alignItems: "flex-start",
  },
  messageColumn: { maxWidth: "83%", gap: 5, alignItems: "flex-start" },
  bubble: {
    backgroundColor: p.white,
    borderRadius: 17,
    borderTopLeftRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: p.border,
  },
  mine: {
    backgroundColor: p.primary,
    borderColor: p.primary,
    borderTopLeftRadius: 17,
    borderTopRightRadius: 4,
  },
  messageText: { fontSize: 14, color: p.ink, lineHeight: 23 },
  timestamp: { fontSize: 9, color: p.secondary, marginHorizontal: 3 },
  composerWrap: {
    backgroundColor: p.white,
    paddingHorizontal: 17,
    borderTopWidth: 1,
    borderTopColor: p.border,
  },
  composer: { paddingVertical: 12, gap: 10, flexDirection: "row" },
  messageInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: p.bg,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 16,
    padding: 13,
    fontSize: 14,
    color: p.ink,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: p.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
