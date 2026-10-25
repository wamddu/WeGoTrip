import { useRef, useState } from "react";
import { router } from "expo-router";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ChatMessage } from "../../data/chat-api";
import {
  formatPollRemaining,
  parseLocalDeadline,
  type PollDeadlineInput,
} from "../../data/poll-deadline";
import {
  Button,
  Card,
  Empty,
  ErrorMessage,
  Icon,
  styles as s,
} from "../../ui/components";
import { SelectField } from "../../ui/select-field";
import { palette as p } from "../../ui/theme";
import {
  ChatSection as LocalChatSection,
  ChatComposer as LocalChatComposer,
} from "./collaboration-sections";
import { useChatRoom } from "./chat-context";
import { ChatPhotoSheet } from "./chat-photo-sheet";
import { PollDeadlineField } from "./poll-deadline-input";
import { usePollTimer } from "./use-poll-timer";
import { useTrip } from "./trip-context";

export { ChatRoomSelector } from "./chat-room-selector";

function PinnedNotice() {
  const { trip } = useTrip();
  const pinned = [...(trip?.notices ?? [])]
    .filter((notice) => notice.pinned)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!trip || !pinned) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`고정 공지: ${pinned.title}`}
      onPress={() =>
        router.push({
          pathname: "/trip/[tripId]/[section]",
          params: { tripId: trip.id, section: "notices", noticeId: pinned.id },
        })
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
      }}
    >
      <Icon name="notice" color={p.coral} size={18} />
      <Text style={[s.strong, { flex: 1 }]} numberOfLines={1}>
        {pinned.title}
      </Text>
    </Pressable>
  );
}

export function ChatSection() {
  const { userApi } = useTrip();
  const chat = useChatRoom();
  if (!userApi)
    return (
      <>
        <Text style={s.small}>
          체험 모드예요. 실시간 채팅·이미지·투표는 서버 연결 모드에서 사용할 수
          있어요.
        </Text>
        <LocalChatSection />
      </>
    );
  return (
    <>
      <PinnedNotice />
      <ErrorMessage message={chat.error} />
      {chat.cursor && (
        <Button
          title="이전 대화 보기"
          secondary
          loading={chat.loading}
          onPress={() => void chat.older()}
        />
      )}
      {chat.loading && !chat.messages.length && (
        <ActivityIndicator
          accessibilityLabel="대화 불러오는 중"
          color={p.primary}
        />
      )}
      {chat.messages.map((message, i) => (
        <Message
          key={message.id}
          message={message}
          showDate={
            !i ||
            new Date(message.createdAt).toLocaleDateString("ko-KR") !==
              new Date(chat.messages[i - 1].createdAt).toLocaleDateString(
                "ko-KR",
              )
          }
        />
      ))}
      {!chat.loading && !chat.messages.length && !chat.error && (
        <Empty
          title={
            chat.imagesOnly
              ? "아직 공유한 이미지가 없어요"
              : "첫 인사를 나눠 보세요"
          }
          description={
            chat.imagesOnly
              ? "이 채팅방에 이미지를 공유하면 여기에 표시돼요."
              : "사진을 공유하고, 가고 싶은 장소를 함께 투표해 보세요."
          }
        />
      )}
    </>
  );
}
function Message({
  message: m,
  showDate,
}: {
  message: ChatMessage;
  showDate: boolean;
}) {
  const { session, trip } = useTrip();
  const chat = useChatRoom();
  const mine = m.authorId === session?.user.id;
  const poll = m.poll;
  const { closed, remaining } = usePollTimer(poll);
  const total =
    poll?.options.reduce((sum, option) => sum + option.votes, 0) ?? 0;
  const participants = poll?.participantCount ?? total;
  const disabled = trip?.archived || chat.busy || closed;
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      {showDate && (
        <Text style={st.date}>
          {new Date(m.createdAt).toLocaleDateString("ko-KR")}
        </Text>
      )}
      <View style={[st.message, mine && { alignItems: "flex-end" }]}>
        <Text style={s.small}>{mine ? "나" : m.authorName}</Text>
        <View
          style={[
            st.bubble,
            mine && !poll && !m.imageUrl && st.mine,
            !!m.imageUrl && st.imageBubble,
            poll && { alignSelf: "stretch" },
          ]}
        >
          {m.imageUrl && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이미지 크게 보기"
              onPress={() => setExpanded(true)}
            >
              <Image
                source={{ uri: m.imageUrl }}
                style={st.image}
                contentFit="contain"
                accessibilityLabel="채팅에 공유한 이미지"
              />
            </Pressable>
          )}
          {!!m.text && (
            <Text
              selectable
              style={[s.body, mine && !m.imageUrl && { color: p.white }]}
            >
              {m.text}
            </Text>
          )}
          {poll && (
            <View style={{ gap: 10 }}>
              <Text style={[s.small, { color: p.primary }]}>
                {closed ? "마감된 투표" : "투표"} ·{" "}
                {poll.allowMultiple ? "복수 선택" : "1인 1표"}
              </Text>
              <Text style={s.sectionTitle}>{poll.question}</Text>
              {!!poll.closesAt && (
                <View style={st.pollDeadline}>
                  <Text
                    style={[
                      s.small,
                      {
                        color: closed ? p.secondary : p.primary,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {closed ? "마감됨" : formatPollRemaining(remaining ?? 0)}
                  </Text>
                  <Text style={s.small}>
                    마감 기한 ·{" "}
                    {new Date(poll.closesAt).toLocaleString("ko-KR", {
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </Text>
                </View>
              )}
              {poll.options.map((option) => {
                const selected = (
                  poll.myOptionIds ?? (poll.myOptionId ? [poll.myOptionId] : [])
                ).includes(option.id);
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole={
                      poll.allowMultiple ? "checkbox" : "radio"
                    }
                    accessibilityLabel={`${option.label}, ${option.votes}표${selected ? ", 내 선택" : ""}`}
                    accessibilityState={{
                      checked: selected,
                      disabled: !!disabled,
                    }}
                    disabled={disabled}
                    onPress={() =>
                      void chat
                        .vote(
                          poll.id,
                          poll.allowMultiple
                            ? option.id
                            : selected
                              ? null
                              : option.id,
                          poll.allowMultiple ? !selected : undefined,
                        )
                        .catch(() => undefined)
                    }
                    style={[
                      st.option,
                      selected && {
                        borderColor: p.primary,
                        backgroundColor: p.blueSoft,
                      },
                    ]}
                  >
                    <View style={s.between}>
                      <Text style={[s.strong, { flex: 1 }]}>
                        {selected ? "✓ " : ""}
                        {option.label}
                      </Text>
                      <Text style={s.small}>
                        {option.votes}표 ·{" "}
                        {participants
                          ? Math.round((option.votes / participants) * 100)
                          : 0}
                        %
                      </Text>
                    </View>
                    {!!option.placeName && (
                      <Text style={s.small}>
                        📍 {option.placeName}
                        {option.placeAddress ? ` · ${option.placeAddress}` : ""}
                        {!option.placeId ? " · 삭제된 장소" : ""}
                      </Text>
                    )}
                    <View style={st.track}>
                      <View
                        style={{
                          height: 4,
                          width: `${participants ? (option.votes / participants) * 100 : 0}%`,
                          backgroundColor: p.primary,
                        }}
                      />
                    </View>
                  </Pressable>
                );
              })}
              <Text style={s.small}>
                {participants}명 참여
                {poll.allowMultiple ? ` · 총 ${total}표` : ""}
                {!closed
                  ? " · 선택한 항목을 다시 누르면 해당 표가 취소돼요"
                  : ""}
              </Text>
              {!closed && (mine || trip?.ownerId === session?.user.id) && (
                <Button
                  title="투표 마감"
                  secondary
                  disabled={disabled}
                  onPress={() =>
                    void chat.close(poll.id).catch(() => undefined)
                  }
                />
              )}
            </View>
          )}
        </View>
        <Text style={st.time}>
          {new Date(m.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <Modal
        visible={expanded}
        transparent
        onRequestClose={() => setExpanded(false)}
      >
        <View style={st.imageModal}>
          <Button
            title="이미지 닫기"
            secondary
            onPress={() => setExpanded(false)}
          />
          <Image
            source={{ uri: m.imageUrl ?? "" }}
            style={{ width: "100%", flex: 1 }}
            contentFit="contain"
            accessibilityLabel="채팅 이미지 확대"
          />
        </View>
      </Modal>
    </View>
  );
}
export function ChatComposer() {
  const { userApi } = useTrip();
  const chat = useChatRoom();
  if (!userApi) return <LocalChatComposer />;
  return <Composer key={chat.roomKey} />;
}
function Composer() {
  const chat = useChatRoom();
  const { trip } = useTrip();
  const [text, setText] = useState("");
  const [photosOpen, setPhotosOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState("");
  const disabled = !!trip?.archived || chat.busy || chat.loading;
  async function send() {
    if (disabled || !text.trim()) return;
    try {
      await chat.send(text.trim(), null);
      setText("");
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <View style={st.composerWrap}>
      <ErrorMessage message={error} />
      {actionsOpen && (
        <View style={st.composerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 첨부"
            accessibilityHint="기기 사진 목록에서 전송할 사진을 선택합니다"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
              Keyboard.dismiss();
              setActionsOpen(false);
              setPhotosOpen(true);
            }}
            style={({ pressed }) => [
              st.attachmentAction,
              { backgroundColor: p.blueSoft },
              (disabled || pressed) && { opacity: 0.5 },
            ]}
          >
            <Icon name="image" size={25} color={p.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="투표 만들기"
            accessibilityHint="질문과 선택 항목을 작성해 투표를 만듭니다"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
              Keyboard.dismiss();
              setActionsOpen(false);
              setPollOpen(true);
            }}
            style={({ pressed }) => [
              st.attachmentAction,
              { backgroundColor: p.purpleSoft },
              (disabled || pressed) && { opacity: 0.5 },
            ]}
          >
            <Icon name="poll" size={25} color={p.purple} />
          </Pressable>
        </View>
      )}
      <View style={st.composer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            actionsOpen ? "첨부 메뉴 닫기" : "이미지·투표 첨부 메뉴 열기"
          }
          accessibilityState={{
            disabled,
            expanded: actionsOpen,
          }}
          disabled={disabled}
          onPress={() => setActionsOpen((open) => !open)}
          style={[
            st.attach,
            disabled && { opacity: 0.4 },
            actionsOpen && { backgroundColor: p.blueSoft },
          ]}
        >
          <Icon name={actionsOpen ? "close" : "plus"} color={p.primary} />
        </Pressable>
        <TextInput
          accessibilityLabel="메시지 입력"
          value={text}
          onChangeText={setText}
          maxLength={2000}
          editable={!disabled}
          placeholder={
            trip?.archived ? "종료한 여행이에요" : "메시지를 입력하세요"
          }
          placeholderTextColor={p.secondary}
          style={st.input}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="메시지 보내기"
          disabled={disabled || !text.trim()}
          onPress={() => void send()}
          style={[st.send, (disabled || !text.trim()) && { opacity: 0.4 }]}
        >
          <Icon name="send" color={p.white} />
        </Pressable>
      </View>
      {pollOpen && <PollForm onClose={() => setPollOpen(false)} />}
      {photosOpen && <ChatPhotoSheet onClose={() => setPhotosOpen(false)} />}
    </View>
  );
}
function PollForm({ onClose }: { onClose(): void }) {
  const chat = useChatRoom();
  const { trip } = useTrip();
  const [question, setQuestion] = useState("");
  const [linkPlaces, setLinkPlaces] = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [deadline, setDeadline] = useState<PollDeadlineInput>({
    enabled: false,
    date: "",
    time: "",
  });
  const pendingPoll = useRef<string | null>(null);
  const [options, setOptions] = useState<
    { label: string; placeId: string | null }[]
  >([
    { label: "", placeId: null },
    { label: "", placeId: null },
  ]);
  const [error, setError] = useState("");
  const update = (i: number, patch: Partial<(typeof options)[number]>) =>
    setOptions((current) =>
      current.map((option, index) =>
        index === i ? { ...option, ...patch } : option,
      ),
    );
  const disabled = chat.busy || !!trip?.archived;
  async function submit() {
    if (disabled) return;
    const choices = options.map((o) => ({
      label: o.label.trim(),
      placeId: linkPlaces ? o.placeId : null,
    }));
    if (!question.trim() || choices.some((o) => !o.label)) {
      setError("질문과 모든 투표 항목을 입력해 주세요.");
      return;
    }
    if (
      new Set(choices.map((o) => o.label.toLocaleLowerCase())).size !==
      choices.length
    ) {
      setError("투표 항목은 서로 다르게 입력해 주세요.");
      return;
    }
    try {
      const closesAt = deadline.enabled
        ? parseLocalDeadline(deadline.date, deadline.time)
        : null;
      const body = {
        question: question.trim(),
        options: choices,
        closesAt,
        allowMultiple,
      };
      const signature = JSON.stringify(body);
      if (
        closesAt &&
        Date.parse(closesAt) <= Date.now() &&
        pendingPoll.current !== signature
      )
        throw new Error("마감 시간은 현재 이후로 지정해 주세요.");
      // Reuse the exact deadline on a retry, even if its creation response was lost until after expiry.
      pendingPoll.current = signature;
      await chat.poll(body);
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => {
        if (!chat.busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: p.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            paddingTop: 60,
            gap: 16,
            width: "100%",
            maxWidth: 680,
            alignSelf: "center",
          }}
        >
          <Text style={s.sectionTitle}>함께 결정해요</Text>
          <Text style={s.small}>2~10개의 항목으로 투표해요.</Text>
          <TextInput
            accessibilityLabel="투표 질문"
            value={question}
            onChangeText={setQuestion}
            maxLength={200}
            placeholder="어디로 갈까요?"
            editable={!disabled}
            style={st.input}
          />
          <View style={st.pollSettings}>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="투표 복수 선택 허용"
              accessibilityState={{ checked: allowMultiple, disabled }}
              aria-checked={allowMultiple}
              disabled={disabled}
              onPress={() => setAllowMultiple((current) => !current)}
              style={({ pressed }) => [
                st.placeToggle,
                (disabled || pressed) && { opacity: 0.5 },
              ]}
            >
              <Text style={[s.small, allowMultiple && { color: p.primary }]}>
                복수 선택
              </Text>
              <View
                style={[
                  st.placeToggleTrack,
                  allowMultiple && { backgroundColor: p.primary },
                ]}
              >
                <View
                  style={[
                    st.placeToggleThumb,
                    allowMultiple && { transform: [{ translateX: 14 }] },
                  ]}
                />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="투표 항목에 장소 연결"
              accessibilityState={{ checked: linkPlaces, disabled }}
              aria-checked={linkPlaces}
              disabled={disabled}
              onPress={() => {
                const next = !linkPlaces;
                setLinkPlaces(next);
                if (!next)
                  setOptions((current) =>
                    current.map((option) => ({ ...option, placeId: null })),
                  );
              }}
              style={({ pressed }) => [
                st.placeToggle,
                (disabled || pressed) && { opacity: 0.5 },
              ]}
            >
              <Text style={[s.small, linkPlaces && { color: p.primary }]}>
                장소 연결
              </Text>
              <View
                style={[
                  st.placeToggleTrack,
                  linkPlaces && { backgroundColor: p.primary },
                ]}
              >
                <View
                  style={[
                    st.placeToggleThumb,
                    linkPlaces && { transform: [{ translateX: 14 }] },
                  ]}
                />
              </View>
            </Pressable>
          </View>
          {allowMultiple && (
            <Text style={s.small}>
              여러 항목에 각각 한 표씩 선택할 수 있어요.
            </Text>
          )}
          {options.map((option, i) => (
            <Card key={i}>
              <View style={{ gap: 10 }}>
                <Text style={s.strong}>항목 {i + 1}</Text>
                {linkPlaces && (
                  <SelectField
                    title={`항목 ${i + 1} 장소 연결`}
                    value={option.placeId}
                    disabled={disabled}
                    options={[
                      { value: null, label: "장소 연결 안 함" },
                      ...(trip?.places.map((place) => ({
                        value: place.id,
                        label: place.name,
                        description: place.address,
                      })) ?? []),
                    ]}
                    onChange={(id) => {
                      const place = trip?.places.find((p) => p.id === id);
                      update(i, {
                        placeId: id,
                        ...(place ? { label: place.name } : {}),
                      });
                    }}
                  />
                )}
                <TextInput
                  accessibilityLabel={`투표 항목 ${i + 1}`}
                  value={option.label}
                  maxLength={150}
                  placeholder="항목 이름"
                  editable={!disabled}
                  onChangeText={(label) => update(i, { label })}
                  style={st.input}
                />
                {options.length > 2 && (
                  <Button
                    title={`항목 ${i + 1} 삭제`}
                    secondary
                    disabled={disabled}
                    onPress={() =>
                      setOptions((current) =>
                        current.filter((_, index) => index !== i),
                      )
                    }
                  />
                )}
              </View>
            </Card>
          ))}
          {options.length < 10 && (
            <Button
              title="투표 항목 추가"
              secondary
              disabled={disabled}
              onPress={() =>
                setOptions((current) => [
                  ...current,
                  { label: "", placeId: null },
                ])
              }
            />
          )}
          <PollDeadlineField
            value={deadline}
            onChange={setDeadline}
            disabled={disabled}
          />
          <ErrorMessage message={error} />
          <Button
            title="투표 올리기"
            loading={chat.busy}
            disabled={disabled}
            onPress={() => void submit()}
          />
          <Button
            title="닫기"
            secondary
            disabled={chat.busy}
            onPress={onClose}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const st = StyleSheet.create({
  pollSettings: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  pollDeadline: {
    backgroundColor: p.bg,
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  placeToggle: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 4,
  },
  placeToggleTrack: {
    width: 34,
    height: 20,
    borderRadius: 10,
    padding: 3,
    backgroundColor: p.secondary,
  },
  placeToggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: p.white,
  },
  date: {
    textAlign: "center",
    color: p.secondary,
    fontSize: 11,
    marginVertical: 20,
  },
  message: { alignItems: "flex-start", gap: 5, marginBottom: 18 },
  bubble: {
    backgroundColor: p.white,
    borderColor: p.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    maxWidth: "94%",
    gap: 8,
  },
  mine: { backgroundColor: p.primary, borderColor: p.primary },
  imageBubble: { backgroundColor: "transparent", borderWidth: 0, padding: 0 },
  image: { width: 240, height: 180, borderRadius: 8, maxWidth: "100%" },
  time: { fontSize: 10, color: p.secondary },
  option: {
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: p.border,
    overflow: "hidden",
  },
  composerWrap: {
    backgroundColor: p.white,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: p.border,
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  attachmentAction: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  attach: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: p.bg,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: p.ink,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: p.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  imageModal: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
    gap: 16,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
});
