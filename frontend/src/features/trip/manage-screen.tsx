import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Share, Text, View } from "react-native";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorMessage,
  Field,
  Section,
  styles as s,
} from "../../ui/components";
import { Confirm, Page } from "../../ui/shell";
import { TripInvitations } from "../home/invitation-panels";
import { useTrip } from "./trip-context";
import { editHref } from "./shared";

export default function ManageScreen() {
  const { trip, data, session, execute, busy, tripApi, refresh } = useTrip();
  const [issuedCode, setIssuedCode] = useState("");
  const [codeAction, setCodeAction] = useState<"issue" | "revoke" | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  useFocusEffect(
    useCallback(() => {
      if (tripApi) void refresh();
      return () => setIssuedCode("");
    }, [tripApi, refresh]),
  );
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  if (!trip)
    return (
      <Page title="여행 정보" back>
        <Empty
          title="여행을 찾을 수 없어요"
          description="내 여행에서 다시 선택해 주세요."
        />
      </Page>
    );
  const owner = trip.ownerId === session!.user.id;
  const candidates = search.trim()
    ? data!.users.filter(
        (u) =>
          !trip.memberIds.includes(u.id) &&
          (!tripApi || data!.friendships[session!.user.id]?.includes(u.id)) &&
          `${u.name} ${u.email}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      )
    : [];
  return (
    <Page title="멤버와 여행 관리" back>
      <Card>
        <Text style={s.sectionTitle}>{trip.title}</Text>
        <Text style={s.body}>{trip.destination}</Text>
        {owner && (
          <Button
            title="여행 정보 수정"
            secondary
            icon="settings"
            onPress={() => router.push(editHref(trip.id, "settings"))}
          />
        )}
      </Card>
      <Section title={`함께하는 ${trip.memberIds.length}명`} />
      {data!.users
        .filter((u) => trip.memberIds.includes(u.id))
        .map((u) => (
          <View key={u.id} style={[s.row, { marginBottom: 15 }]}>
            <Avatar user={u} size={42} />
            <View style={s.flex}>
              <Text style={s.strong}>
                {u.name}
                {u.id === session!.user.id ? " (나)" : ""}
              </Text>
              <Text style={s.small}>{u.email}</Text>
            </View>
            {u.id === trip.ownerId && <Badge>여행장</Badge>}
          </View>
        ))}
      <Section title="친구 초대" />
      {(!tripApi || (owner && !trip.archived)) && (
        <Card>
          <Text style={s.small}>우리 여행의 초대 코드</Text>
          <Text selectable style={[s.title, { letterSpacing: 3 }]}>
            {tripApi ? issuedCode || "코드를 발급해 주세요" : trip.inviteCode}
          </Text>
          <Button
            title="초대 코드 공유"
            disabled={!!tripApi && !issuedCode}
            secondary
            icon="link"
            onPress={() => {
              void Share.share({
                message: `${trip.title}에 함께해요! WeGoTrip에서 초대 코드 ${tripApi ? issuedCode : trip.inviteCode}를 입력해 주세요.`,
              }).catch(() =>
                setError("공유 창을 열지 못했어요. 위 코드를 복사해 주세요."),
              );
            }}
          />
          {tripApi && (
            <>
              <Text style={s.small}>
                코드는 7일간 유효하며 이 화면에서만 확인할 수 있어요. 새로
                발급하면 이전 코드는 폐기돼요. 코드를 받은 사람은 친구가
                아니어도 참여할 수 있어요.
              </Text>
              <Button
                title="새 초대 코드 발급"
                secondary
                disabled={codeBusy}
                onPress={() => setCodeAction("issue")}
              />
              <Button
                title="초대 코드 폐기"
                secondary
                disabled={codeBusy}
                onPress={() => setCodeAction("revoke")}
              />
            </>
          )}
        </Card>
      )}
      {tripApi && !owner && (
        <Text style={s.small}>
          친구 초대와 코드 발급은 여행장이 할 수 있어요.
        </Text>
      )}
      {owner && !trip.archived && (
        <View style={{ marginTop: 18 }}>
          <Field
            title="초대할 친구 검색"
            value={search}
            onChangeText={setSearch}
            placeholder="이름 또는 이메일"
          />
          {candidates.map((u) => (
            <View key={u.id} style={[s.between, { marginBottom: 12 }]}>
              <Text style={s.strong}>{u.name}</Text>
              <Button
                title={`${u.name} 초대`}
                secondary
                disabled={busy}
                onPress={() => {
                  void execute({
                    type: "trip.invite",
                    tripId: trip.id,
                    userId: u.id,
                  })
                    .then(() => {
                      setSearch("");
                      setRevision((v) => v + 1);
                      if (tripApi)
                        setMessage(
                          "초대를 보냈어요. 친구가 수락하면 멤버에 추가돼요.",
                        );
                    })
                    .catch((e) => setError(e.message));
                }}
              />
            </View>
          ))}
        </View>
      )}
      {!!message && <Text style={s.small}>{message}</Text>}
      {tripApi && owner && (
        <TripInvitations tripId={trip.id} revision={revision} />
      )}
      <Section
        title="파티 관리"
        action="파티 만들기"
        onPress={() => router.push(editHref(trip.id, "parties"))}
      />
      {tripApi && (
        <Text style={s.small}>
          파티는 여행 멤버와 공유돼요. 일정은 현재 이 기기에만 저장돼요.
        </Text>
      )}
      {trip.parties.map((party) => (
        <View key={party.id} style={{ marginBottom: 12 }}>
          <Card>
            <Text style={s.strong}>{party.name}</Text>
            <Text style={s.body}>
              {data!.users
                .filter((u) => party.memberIds.includes(u.id))
                .map((u) => u.name)
                .join(", ")}
            </Text>
            <Button
              title={`${party.name} 수정`}
              secondary
              onPress={() =>
                router.push(editHref(trip.id, "parties", party.id))
              }
            />
          </Card>
        </View>
      ))}
      {!trip.parties.length && (
        <Text style={s.body}>
          잠깐 다른 일정을 보낼 멤버끼리 파티를 만들어 보세요.
        </Text>
      )}
      <ErrorMessage message={error} />
      <Confirm
        visible={!!codeAction}
        title={
          codeAction === "issue"
            ? "새 초대 코드를 발급할까요?"
            : "초대 코드를 폐기할까요?"
        }
        description="기존 코드는 더 이상 사용할 수 없어요."
        onCancel={() => setCodeAction(null)}
        onConfirm={() => {
          const action = codeAction;
          setCodeAction(null);
          if (!tripApi || codeBusy) return;
          setCodeBusy(true);
          setError("");
          void (
            action === "issue"
              ? tripApi.issueCode(trip.id).then((r) => setIssuedCode(r.code))
              : tripApi.revokeCode(trip.id).then(() => setIssuedCode(""))
          )
            .catch((e) => setError(e.message))
            .finally(() => setCodeBusy(false));
        }}
      />
    </Page>
  );
}
