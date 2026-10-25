import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { uid, type Command, type Notice, type Trip } from "../../domain/models";
import { ApiError } from "../../data/user-api";
import { RepositoryConflictError } from "../../data/user-travel-repository";
import {
  Button,
  Chip,
  Empty,
  ErrorMessage,
  Field,
  styles as s,
} from "../../ui/components";
import { Confirm, Page } from "../../ui/shell";
import { useTrip } from "./trip-context";
import { tripHref } from "../home/home-screen";

export function NoticeEditor({
  trip,
  itemId,
}: {
  trip: Trip;
  itemId?: string;
}) {
  const { session, execute, busy, loading } = useTrip();
  const existing = trip.notices.find((item) => item.id === itemId);
  const [id] = useState(() => itemId ?? uid());
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [version, setVersion] = useState(existing?.version);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [expired, setExpired] = useState(false);
  const [retry, setRetry] = useState<Command | null>(null);
  const [confirm, setConfirm] = useState(false);
  const missing = !!itemId && !existing;
  const disabled =
    busy ||
    loading ||
    trip.archived ||
    missing ||
    conflict ||
    expired ||
    !!retry;
  function leave() {
    router.replace(tripHref(trip.id, "notices"));
  }
  async function submit(command: Command) {
    setError("");
    setConfirm(false);
    try {
      await execute(command);
      leave();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "공지를 저장하지 못했어요.",
      );
      if (failure instanceof RepositoryConflictError) {
        setRetry(null);
        setConflict(true);
        setExpired(failure.code === "NOTICE_RETRY_EXPIRED");
      } else if (
        failure instanceof ApiError &&
        failure.status >= 400 &&
        failure.status < 500
      )
        setRetry(null);
      else setRetry(command);
    }
  }
  function save() {
    if (disabled) return;
    if (!title.trim() || !body.trim()) {
      setError("공지 제목과 내용을 입력해 주세요.");
      return;
    }
    const item: Notice = {
      id,
      title: title.trim(),
      body: body.trim(),
      pinned,
      version,
      authorId: existing?.authorId ?? session!.user.id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    void submit({
      type: "item.save",
      collection: "notices",
      tripId: trip.id,
      item,
    });
  }
  function latest() {
    if (!existing) return;
    setTitle(existing.title);
    setBody(existing.body);
    setPinned(existing.pinned);
    setVersion(existing.version);
    setConflict(false);
    setError("");
  }
  if (trip.ownerId !== session?.user.id)
    return (
      <Page title="여행 공지" back>
        <Empty
          title="여행장만 공지를 관리할 수 있어요"
          description="공지 목록에서 여행장의 안내를 확인해 주세요."
          action="공지 목록으로"
          onPress={leave}
        />
      </Page>
    );
  return (
    <Page title={itemId ? "공지 수정" : "공지 작성"} back>
      <ErrorMessage message={error} />
      {missing && !retry ? (
        <Empty
          title="삭제된 공지예요"
          description="공지 목록에서 최신 내용을 확인해 주세요."
          action="공지 목록으로"
          onPress={leave}
        />
      ) : (
        <>
          <Field
            title="제목"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            editable={!disabled}
            placeholder="공지 제목을 입력해 주세요"
          />
          <Field
            title="공지 내용"
            value={body}
            onChangeText={setBody}
            maxLength={3000}
            editable={!disabled}
            multiline
            placeholder="멤버들에게 알릴 내용을 입력해 주세요"
          />
          <Chip
            title="상단에 고정"
            active={pinned}
            onPress={() => {
              if (!disabled) setPinned(!pinned);
            }}
          />
          {!itemId && (
            <Text style={s.small}>
              여행 멤버들에게 공유하고 새 공지 알림을 보내요.
            </Text>
          )}
          {trip.archived && (
            <Text style={s.small}>종료한 여행의 공지는 수정할 수 없어요.</Text>
          )}
          {conflict && !expired && existing && (
            <View style={{ gap: 10 }}>
              <Text style={s.body}>
                입력한 내용은 유지했어요. 최신 공지를 불러온 뒤 다시 수정해
                주세요.
              </Text>
              <Button title="최신 공지 불러오기" secondary onPress={latest} />
            </View>
          )}
          {expired && (
            <Button title="공지 목록에서 결과 확인" secondary onPress={leave} />
          )}
          {retry ? (
            <View style={{ gap: 10 }}>
              <Text style={s.small}>
                저장 결과를 확인할 수 없어요. 같은 요청으로 결과를 다시 확인해
                주세요.
              </Text>
              <Button
                title="저장 상태 다시 확인"
                loading={busy}
                disabled={loading}
                onPress={() => void submit(retry)}
              />
            </View>
          ) : (
            <>
              <Button
                title={itemId ? "변경 내용 저장" : "공지 등록"}
                loading={busy}
                disabled={disabled}
                onPress={save}
              />
              {itemId && (
                <Button
                  title="공지 삭제"
                  danger
                  disabled={disabled}
                  onPress={() => setConfirm(true)}
                />
              )}
            </>
          )}
        </>
      )}
      <Confirm
        visible={confirm}
        title="공지를 삭제할까요?"
        description="여행 멤버들에게도 더 이상 표시되지 않아요."
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (!disabled && itemId)
            void submit({
              type: "item.delete",
              collection: "notices",
              tripId: trip.id,
              itemId,
              expectedVersion: version,
            });
        }}
      />
    </Page>
  );
}
