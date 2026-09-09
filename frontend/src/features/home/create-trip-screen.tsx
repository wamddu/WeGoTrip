import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useTravel } from "../../state/travel-provider";
import {
  Button,
  Chip,
  ErrorMessage,
  Field,
  Section,
  styles as s,
} from "../../ui/components";
import { Page } from "../../ui/shell";
import { tripHref } from "./home-screen";
import { localDate } from "../../domain/models";

export function CreateTripScreen() {
  const { data, session, execute, busy } = useTravel();
  const today = localDate();
  const [mode, setMode] = useState("새 여행");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [budget, setBudget] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const friends =
    data?.users.filter((u) =>
      data.friendships[session!.user.id]?.includes(u.id),
    ) ?? [];
  async function submit() {
    setError("");
    try {
      const next = await execute(
        mode === "새 여행"
          ? {
              type: "trip.create",
              input: {
                title: title.trim(),
                destination: destination.trim(),
                startDate: start,
                endDate: end,
                budget: Number(budget.replaceAll(",", "")),
                memberIds: members,
              },
            }
          : { type: "trip.join", code },
      );
      const previous = new Set(data?.trips.map((t) => t.id));
      const created = next.trips.find((t) => !previous.has(t.id));
      router.replace(created ? tripHref(created.id) : "/trips");
    } catch (e) {
      setError(e instanceof Error ? e.message : "여행을 저장하지 못했어요.");
    }
  }
  return (
    <Page title="새로운 여정" back navigation={false}>
      <View style={[s.wrap, { marginBottom: 24 }]}>
        {["새 여행", "초대 코드로 참여"].map((value) => (
          <Chip
            key={value}
            title={value}
            active={mode === value}
            onPress={() => setMode(value)}
          />
        ))}
      </View>
      {mode === "새 여행" ? (
        <>
          <Field
            title="여행 이름"
            placeholder="예: 바다 보러, 부산"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <Field
            title="목적지"
            placeholder="어디로 떠날까요?"
            value={destination}
            onChangeText={setDestination}
            maxLength={100}
          />
          <Field
            title="출발일 (YYYY-MM-DD)"
            value={start}
            onChangeText={setStart}
          />
          <Field
            title="마지막 날 (YYYY-MM-DD)"
            value={end}
            onChangeText={setEnd}
          />
          <Field
            title="총 예산 (원)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="number-pad"
            placeholder="미정이면 0원"
          />
          <Section title="함께할 친구" />
          <Text style={[s.body, { marginBottom: 14 }]}>
            지금 선택하거나, 여행을 만든 뒤 초대할 수 있어요.
          </Text>
          <View style={s.wrap}>
            {friends.map((u) => (
              <Chip
                key={u.id}
                title={u.name}
                active={members.includes(u.id)}
                onPress={() =>
                  setMembers((list) =>
                    list.includes(u.id)
                      ? list.filter((id) => id !== u.id)
                      : [...list, u.id],
                  )
                }
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <Field
            title="초대 코드"
            placeholder="친구에게 받은 코드를 입력하세요"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          <Text style={s.body}>
            여행장이 공유한 코드로 같은 여행에 참여해요.
          </Text>
        </>
      )}
      <ErrorMessage message={error} />
      <View style={{ marginTop: 25 }}>
        <Button
          title={mode === "새 여행" ? "우리 여행 만들기" : "여행 참여하기"}
          onPress={() => void submit()}
          loading={busy}
        />
      </View>
    </Page>
  );
}
