import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { uid, type Command } from "../../domain/models";
import { RepositoryConflictError } from "../../data/user-travel-repository";
import { ApiError } from "../../data/user-api";
import {
  Avatar,
  Badge,
  Button,
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
import { SelectField } from "../../ui/select-field";

export function ChecklistSection() {
  const {
    trip: t,
    data,
    session,
    execute,
    busy,
    loading,
    tripApi,
    refresh,
  } = useTrip();
  useFocusEffect(
    useCallback(() => {
      if (!tripApi) return;
      void refresh();
    }, [tripApi, refresh]),
  );
  const trip = t!;
  const [filter, setFilter] = useState("전체");
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<Extract<
    Command,
    { type: "checklist.complete" }
  > | null>(null);
  const disabled = busy || loading || trip.archived || !!retry;
  const canComplete = (ownerId: string | null) => ownerId === session!.user.id;
  const people = data!.users.filter((person) =>
    trip.memberIds.includes(person.id),
  );
  const assignedItems = trip.checklist.filter((item) => item.ownerId !== null);
  const memberProgress = people.map((person) => {
    const items = assignedItems.filter((item) => item.ownerId === person.id);
    return {
      person,
      total: items.length,
      completed: items.filter((item) => item.done).length,
    };
  });
  async function complete(
    command: Extract<Command, { type: "checklist.complete" }>,
  ) {
    setError("");
    try {
      await execute(command);
      setRetry(null);
    } catch (error) {
      setRetry(
        tripApi &&
          !(error instanceof RepositoryConflictError) &&
          (!(error instanceof ApiError) || error.status >= 500)
          ? command
          : null,
      );
      setError(
        error instanceof Error
          ? error.message
          : "완료 상태를 저장하지 못했어요.",
      );
    }
  }
  const list = assignedItems
    .filter(
      (c) =>
        (memberFilter === null || c.ownerId === memberFilter) &&
        (filter === "전체" ||
          (filter === "내 준비물" ? c.ownerId === session!.user.id : !c.done)),
    )
    .sort((a, b) => {
      if (a.done !== b.done) return Number(a.done) - Number(b.done);
      // Decimal strings preserve server BIGINT ordering without Number precision loss.
      if (/^\d+$/.test(a.id) && /^\d+$/.test(b.id)) {
        const left = a.id.replace(/^0+/, "") || "0";
        const right = b.id.replace(/^0+/, "") || "0";
        return left.length - right.length || left.localeCompare(right);
      }
      return a.id.localeCompare(b.id);
    });
  const completed = assignedItems.filter((c) => c.done).length;
  return (
    <>
      <Card>
        <View style={[s.between, { flexWrap: "wrap" }]}>
          <Text style={s.sectionTitle}>하나씩, 빠짐없이</Text>
          <Badge>
            완료 {completed} / 전체 {assignedItems.length}
          </Badge>
        </View>
        <View style={st.progress}>
          <View
            style={[
              st.progressFill,
              {
                width: `${assignedItems.length ? (completed / assignedItems.length) * 100 : 0}%`,
              },
            ]}
          />
        </View>
        <Text style={s.small}>
          모두가 챙기는 준비물도 각자의 항목으로 관리해요. 내가 맡은 준비물만
          체크할 수 있어요.
        </Text>
      </Card>
      {memberProgress.length > 0 && (
        <>
          <Section title="멤버별 준비 현황" />
          <Card>
            {memberProgress.map(({ person, total, completed }) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`${person.name} 준비물 보기, ${total}개 중 ${completed}개 완료`}
                onPress={() => {
                  setMemberFilter(person.id);
                  setFilter("전체");
                }}
                style={st.memberProgress}
              >
                <Avatar user={person} size={30} />
                <View style={s.flex}>
                  <Text style={s.strong}>
                    {person.name}
                    {person.id === session!.user.id ? " · 나" : ""}
                  </Text>
                  <Text style={s.small}>
                    {total === 0
                      ? "배정된 준비물이 없어요"
                      : completed === total
                        ? "모두 챙겼어요"
                        : `${total - completed}개 더 챙겨야 해요`}
                  </Text>
                </View>
                <Badge
                  background={
                    total > 0 && completed === total ? p.mintSoft : p.blueSoft
                  }
                >
                  {completed} / {total}
                </Badge>
                <Icon name="arrow" size={14} color={p.secondary} />
              </Pressable>
            ))}
          </Card>
        </>
      )}
      {trip.legacyChecklistPreserved && (
        <Text style={[s.small, { marginTop: 14 }]}>
          준비물은 이제 멤버들과 공유돼요. 이전에 이 기기에 저장한 목록은 별도로
          보관되며 공유 목록에 자동으로 합쳐지지 않아요.
        </Text>
      )}
      <View style={{ marginTop: 20 }}>
        <SelectField
          title="누구의 준비물을 볼까요?"
          value={memberFilter}
          options={[
            { value: null, label: "모든 멤버" },
            ...people.map((person) => ({
              value: person.id,
              label:
                person.id === session!.user.id
                  ? `${person.name} · 나`
                  : person.name,
            })),
          ]}
          onChange={(value) => {
            setMemberFilter(value);
            setFilter("전체");
          }}
          icon="users"
          searchPlaceholder="멤버 이름 검색"
        />
      </View>
      <View style={[s.wrap, { marginTop: 20 }]}>
        {["전체", "내 준비물", "미완료"].map((v) => (
          <Chip
            key={v}
            title={v}
            active={filter === v}
            onPress={() => {
              setFilter(v);
              if (v === "내 준비물") setMemberFilter(null);
            }}
          />
        ))}
      </View>
      <Section
        title="여행 준비물"
        action={disabled ? undefined : "항목 추가"}
        onPress={() => router.push(editHref(trip.id, "checklist"))}
      />
      <ErrorMessage message={error} />
      {retry && (
        <View style={{ gap: 10, marginBottom: 16 }}>
          <Text style={s.small}>
            완료 요청의 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해
            주세요.
          </Text>
          <Button
            title="완료 요청 다시 확인하기"
            secondary
            loading={busy}
            disabled={loading}
            onPress={() => void complete(retry)}
          />
        </View>
      )}
      {list.map((item) => (
        <View style={st.checkRow} key={item.id}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`${item.title}, ${data!.users.find((person) => person.id === item.ownerId)?.name ?? "여행 멤버"}, ${item.done ? "준비 완료" : "미완료"}`}
            accessibilityHint={
              canComplete(item.ownerId)
                ? undefined
                : "담당자만 완료 상태를 변경할 수 있어요."
            }
            accessibilityState={{
              checked: item.done,
              disabled: disabled || !canComplete(item.ownerId),
            }}
            aria-checked={item.done}
            disabled={disabled || !canComplete(item.ownerId)}
            onPress={() => {
              void complete({
                type: "checklist.complete",
                tripId: trip.id,
                itemId: item.id,
                done: !item.done,
                expectedStateToken: item.stateToken,
              });
            }}
            style={[s.row, s.flex, { minHeight: 53 }]}
          >
            <View
              style={[
                st.checkbox,
                !canComplete(item.ownerId) && { opacity: 0.4 },
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
                  "여행 멤버"}
                {item.ownerId === session!.user.id ? " · 나" : ""} ·{" "}
                {item.done ? "준비 완료" : "미완료"}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 수정`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => router.push(editHref(trip.id, "checklist", item.id))}
            style={[s.iconButton, disabled && { opacity: 0.4 }]}
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
  const { trip: t, data, session, tripApi, refresh } = useTrip();
  const { noticeId } = useLocalSearchParams<{ noticeId?: string }>();
  useFocusEffect(
    useCallback(() => {
      if (tripApi) void refresh();
    }, [tripApi, refresh]),
  );
  const trip = t!;
  const notices = [...trip.notices].sort(
    (a, b) =>
      Number(b.id === noticeId) - Number(a.id === noticeId) ||
      Number(b.pinned) - Number(a.pinned) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <>
      <Section
        title="함께 알아두면 좋은 소식"
        action={
          trip.ownerId === session!.user.id && !trip.archived
            ? "공지 작성"
            : undefined
        }
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
              {trip.ownerId === session!.user.id && !trip.archived && (
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
              {n.authorName ??
                data!.users.find((u) => u.id === n.authorId)?.name ??
                "탈퇴한 사용자"}{" "}
              · {n.createdAt.slice(0, 10)}
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
      {noticeId && !notices.some((notice) => notice.id === noticeId) && (
        <Text style={s.small}>
          알림의 공지가 삭제됐거나 더 이상 표시되지 않아요.
        </Text>
      )}
      {trip.legacyNoticesPreserved && (
        <Text style={s.small}>
          이 기기에 저장된 이전 공지는 원본 그대로 보관했어요. 새 공지부터
          멤버들과 공유돼요.
        </Text>
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
  memberProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    paddingVertical: 8,
  },
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
