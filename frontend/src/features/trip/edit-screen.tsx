import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  equalShares,
  money,
  uid,
  type Collection,
  type Command,
  type Trip,
} from "../../domain/models";
import {
  Button,
  Chip,
  Empty,
  ErrorMessage,
  Field,
  Section,
  styles as s,
} from "../../ui/components";
import { Confirm, Page } from "../../ui/shell";
import { useTrip } from "./trip-context";
import { parseCoordinates, validCoordinates } from "../../domain/route";
import { GeographicMap } from "../../ui/geographic-map";
import { palette as p } from "../../ui/theme";

type Kind = Exclude<Collection, "messages"> | "settings";
const titles: Record<Kind, string> = {
  agenda: "일정",
  places: "장소",
  expenses: "지출",
  checklist: "준비물",
  notices: "공지",
  parties: "파티",
  settings: "여행 설정",
};
const toSection: Record<Kind, string> = {
  agenda: "schedule",
  places: "places",
  expenses: "expenses",
  checklist: "checklist",
  notices: "notices",
  parties: "overview",
  settings: "overview",
};
export default function EditScreen() {
  const params = useLocalSearchParams<{
    kind: string;
    itemId?: string;
    placeId?: string;
  }>();
  const { trip } = useTrip();
  if (!trip || !(params.kind in titles))
    return (
      <Page title="항목을 찾을 수 없어요" back>
        <Empty
          title="다시 선택해 주세요"
          description="내 여행에서 항목을 다시 열어 주세요."
        />
      </Page>
    );
  const kind = params.kind as Kind;
  if (
    params.itemId &&
    kind !== "settings" &&
    !trip[kind].some((i) => i.id === params.itemId)
  )
    return (
      <Page title="삭제된 항목" back>
        <Empty
          title="항목을 찾을 수 없어요"
          description="다른 멤버가 삭제했을 수 있어요. 목록에서 다시 확인해 주세요."
        />
      </Page>
    );
  return (
    <Editor
      key={`${trip.id}-${kind}-${params.itemId ?? "new"}`}
      trip={trip}
      kind={kind}
      itemId={params.itemId}
      placeId={params.placeId}
    />
  );
}

function Editor({
  trip,
  kind,
  itemId,
  placeId,
}: {
  trip: Trip;
  kind: Kind;
  itemId?: string;
  placeId?: string;
}) {
  const { date, partyId, data, session, execute, busy } = useTrip();
  const existing =
    kind === "settings" ? trip : trip[kind].find((item) => item.id === itemId);
  const initial = (existing ?? {}) as unknown as Record<string, unknown>;
  const defaultParty =
    !existing && (kind === "agenda" || kind === "expenses")
      ? trip.parties.find((p) => p.id === partyId)
      : undefined;
  const string = (key: string, fallback = "") =>
    typeof initial[key] === "string" || typeof initial[key] === "number"
      ? String(initial[key])
      : fallback;
  const [form, setForm] = useState<Record<string, string>>({
    title: string("title", string("name")),
    destination: string("destination"),
    date: string("date", defaultParty?.date ?? date),
    startDate: string("startDate", trip.startDate),
    endDate: string("endDate", trip.endDate),
    startTime: string("startTime", defaultParty?.startTime ?? "09:00"),
    endTime: string("endTime", defaultParty?.endTime ?? "10:00"),
    amount: string("amount"),
    budget: string("budget", String(trip.budget)),
    address: string("address"),
    latitude: validCoordinates(initial.coordinates)
      ? String(initial.coordinates.latitude)
      : "",
    longitude: validCoordinates(initial.coordinates)
      ? String(initial.coordinates.longitude)
      : "",
    category: string("category", "볼거리"),
    note: string("note"),
    body: string("body"),
  });
  const [selectedPlace, setSelectedPlace] = useState<string | null>(
    string("placeId") || placeId || null,
  );
  const [selectedParty, setSelectedParty] = useState<string | null>(
    existing ? string("partyId") || null : (defaultParty?.id ?? null),
  );
  const [payer, setPayer] = useState(string("payerId", session!.user.id));
  const initialShares = (initial.shares ?? {}) as Record<string, number>;
  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    kind === "parties"
      ? ((initial.memberIds as string[]) ?? [session!.user.id])
      : Object.keys(initialShares).length
        ? Object.keys(initialShares)
        : [...(defaultParty?.memberIds ?? trip.memberIds)],
  );
  const [split, setSplit] = useState(
    Object.keys(initialShares).length ? "직접 지정" : "균등 분할",
  );
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initialShares).map(([id, amount]) => [id, String(amount)]),
    ),
  );
  const [owner, setOwner] = useState<string | null>(string("ownerId") || null);
  const [pinned, setPinned] = useState(Boolean(initial.pinned));
  const [archived, setArchived] = useState(trip.archived);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const previewCoordinates = {
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
  };
  const hasCoordinates =
    !!form.latitude.trim() &&
    !!form.longitude.trim() &&
    validCoordinates(previewCoordinates);
  const people = data!.users.filter((user) => trip.memberIds.includes(user.id));
  const patch = (key: string, value: string) =>
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "address" && value !== current.address
        ? { latitude: "", longitude: "" }
        : {}),
    }));
  const field = (
    key: string,
    title: string,
    placeholder = "",
    extra: Record<string, unknown> = {},
  ) => (
    <Field
      title={title}
      value={form[key]}
      onChangeText={(value) => patch(key, value)}
      placeholder={placeholder}
      maxLength={key === "body" ? 3000 : key === "note" ? 1000 : 150}
      {...extra}
    />
  );
  const toggleMember = (id: string) =>
    setSelectedMembers((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  const parseMoney = (value: string) =>
    /^\d+$/.test(value.replaceAll(",", "").trim())
      ? Number(value.replaceAll(",", ""))
      : NaN;
  const numericAmount = parseMoney(form.amount);
  let shares: Record<string, number> = {};
  const orderedMembers = trip.memberIds.filter((id) =>
    selectedMembers.includes(id),
  );
  if (
    split === "균등 분할" &&
    Number.isSafeInteger(numericAmount) &&
    numericAmount > 0 &&
    orderedMembers.length
  )
    shares = equalShares(numericAmount, orderedMembers);
  if (split === "직접 지정")
    shares = Object.fromEntries(
      orderedMembers.map((id) => [id, parseMoney(custom[id] ?? "0")]),
    );
  function leave() {
    router.canGoBack()
      ? router.back()
      : router.replace(`/trip/${trip.id}/${toSection[kind]}`);
  }
  async function save() {
    setError("");
    const id = itemId ?? uid();
    const authorId = session!.user.id;
    const createdAt = new Date().toISOString();
    try {
      let command: Command;
      switch (kind) {
        case "agenda":
          command = {
            type: "item.save",
            tripId: trip.id,
            collection: "agenda",
            item: {
              id,
              title: form.title.trim(),
              date: form.date,
              startTime: form.startTime,
              endTime: form.endTime,
              placeId: selectedPlace,
              partyId: selectedParty,
              note: form.note,
            },
          };
          break;
        case "places":
          command = {
            type: "item.save",
            tripId: trip.id,
            collection: "places",
            item: {
              id,
              name: form.title.trim(),
              address: form.address.trim(),
              coordinates: parseCoordinates(form.latitude, form.longitude),
              category: form.category,
              note: form.note,
            },
          };
          break;
        case "expenses":
          command = {
            type: "item.save",
            tripId: trip.id,
            collection: "expenses",
            item: {
              id,
              title: form.title.trim(),
              amount: numericAmount,
              date: form.date,
              payerId: payer,
              shares,
              partyId: selectedParty,
              note: form.note,
            },
          };
          break;
        case "checklist":
          command = {
            type: "item.save",
            tripId: trip.id,
            collection: "checklist",
            item: {
              id,
              title: form.title.trim(),
              ownerId: owner,
              done: Boolean(initial.done),
            },
          };
          break;
        case "notices":
          command = {
            type: "item.save",
            tripId: trip.id,
            collection: "notices",
            item: {
              id,
              title: form.title.trim(),
              body: form.body.trim(),
              pinned,
              authorId,
              createdAt,
            },
          };
          break;
        case "parties":
          command = {
            type: "item.save",
            tripId: trip.id,
            collection: "parties",
            item: {
              id,
              name: form.title.trim(),
              memberIds: selectedMembers,
              date: form.date,
              startTime: form.startTime,
              endTime: form.endTime,
            },
          };
          break;
        case "settings":
          command = {
            type: "trip.update",
            tripId: trip.id,
            input: {
              title: form.title.trim(),
              destination: form.destination.trim(),
              startDate: form.startDate,
              endDate: form.endDate,
              budget: form.budget.trim() ? parseMoney(form.budget) : 0,
              archived,
            },
          };
          break;
      }
      await execute(command);
      leave();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했어요. 입력한 내용을 확인해 주세요.",
      );
    }
  }
  async function remove() {
    if (!itemId || kind === "settings") return;
    try {
      await execute({
        type: "item.delete",
        tripId: trip.id,
        collection: kind,
        itemId,
      });
      setConfirm(false);
      leave();
    } catch (e) {
      setConfirm(false);
      setError((e as Error).message);
    }
  }
  function selectParty(id: string | null) {
    setSelectedParty(id);
    const party = trip.parties.find((p) => p.id === id);
    if (party && kind === "expenses") setSelectedMembers([...party.memberIds]);
    if (party && kind === "agenda" && !itemId)
      setForm((current) => ({
        ...current,
        date: party.date,
        startTime: party.startTime,
        endTime: party.endTime,
      }));
  }
  return (
    <Page
      title={`${titles[kind]} ${kind === "settings" ? "" : itemId ? "수정" : "추가"}`}
      back
      navigation={false}
    >
      {trip.archived && kind !== "settings" && (
        <ErrorMessage message="종료한 여행이에요. 여행 설정에서 다시 열어 주세요." />
      )}
      {field(
        "title",
        kind === "places"
          ? "장소 이름"
          : kind === "parties"
            ? "파티 이름"
            : kind === "settings"
              ? "여행 이름"
              : `${titles[kind]} 제목`,
      )}
      {(kind === "agenda" || kind === "parties" || kind === "expenses") &&
        field("date", "날짜 (YYYY-MM-DD)")}
      {(kind === "agenda" || kind === "parties") && (
        <>
          <View style={s.row}>
            <View style={s.flex}>
              {field("startTime", "시작 시간 (HH:MM)")}
            </View>
            <View style={s.flex}>{field("endTime", "종료 시간 (HH:MM)")}</View>
          </View>
        </>
      )}
      {(kind === "agenda" || kind === "expenses") && (
        <>
          <Section title="파티 선택" />
          <View style={[s.wrap, { marginBottom: 20 }]}>
            <Chip
              title={kind === "agenda" ? "모두 함께" : "공동 지출"}
              active={!selectedParty}
              onPress={() => selectParty(null)}
            />
            {trip.parties.map((p) => (
              <Chip
                key={p.id}
                title={p.name}
                active={selectedParty === p.id}
                onPress={() => selectParty(p.id)}
              />
            ))}
          </View>
        </>
      )}
      {kind === "agenda" && (
        <>
          <Section title="저장 장소 연결" />
          <View style={[s.wrap, { marginBottom: 20 }]}>
            <Chip
              title="장소 미정"
              active={!selectedPlace}
              onPress={() => setSelectedPlace(null)}
            />
            {trip.places.map((p) => (
              <Chip
                key={p.id}
                title={p.name}
                active={selectedPlace === p.id}
                onPress={() => setSelectedPlace(p.id)}
              />
            ))}
          </View>
          {field("note", "메모", "함께 알아두면 좋은 내용", {
            multiline: true,
          })}
        </>
      )}
      {kind === "places" && (
        <>
          {field("address", "주소")}
          <Section title="지도 위치 (선택)" />
          <Text style={[s.small, { marginBottom: 12 }]}>
            지도를 눌러 위치를 선택하거나 위도·경도를 입력해 주세요. 주소를
            바꾸면 위치도 다시 선택해 주세요.
          </Text>
          <Button
            title={mapOpen ? "위치 지도 접기" : "지도에서 위치 선택"}
            secondary
            icon="map"
            onPress={() => setMapOpen((value) => !value)}
          />
          {mapOpen && (
            <View style={{ marginVertical: 12 }}>
              <GeographicMap
                initialCenter={
                  trip.places.find((place) =>
                    validCoordinates(place.coordinates),
                  )?.coordinates ?? { latitude: 36.3, longitude: 127.8 }
                }
                markers={
                  hasCoordinates
                    ? [
                        {
                          id: "place",
                          label: "1",
                          title: form.title || "선택한 장소",
                          coordinates: previewCoordinates,
                          color: p.primary,
                        },
                      ]
                    : []
                }
                onPick={(coordinates) =>
                  setForm((current) => ({
                    ...current,
                    latitude: coordinates.latitude.toFixed(6),
                    longitude: coordinates.longitude.toFixed(6),
                  }))
                }
              />
            </View>
          )}
          <View style={{ marginTop: 12 }}>
            {field("latitude", "위도", "예: 35.1587", {
              keyboardType: "numbers-and-punctuation",
            })}
            {field("longitude", "경도", "예: 129.1604", {
              keyboardType: "numbers-and-punctuation",
            })}
          </View>
          {hasCoordinates && (
            <Button
              title="위치 지우기"
              secondary
              onPress={() =>
                setForm((current) => ({
                  ...current,
                  latitude: "",
                  longitude: "",
                }))
              }
            />
          )}
          <Section title="장소 분류" />
          <View style={[s.wrap, { marginBottom: 20 }]}>
            {["음식점", "카페", "숙소", "볼거리", "교통", "기타"].map((v) => (
              <Chip
                key={v}
                title={v}
                active={form.category === v}
                onPress={() => patch("category", v)}
              />
            ))}
          </View>
          {field("note", "메모", "이곳에서 하고 싶은 일", { multiline: true })}
        </>
      )}
      {kind === "expenses" && (
        <>
          {field("amount", "금액 (원)", "예: 48000", {
            keyboardType: "number-pad",
          })}
          <Section title="누가 결제했나요?" />
          <View style={s.wrap}>
            {people.map((u) => (
              <Chip
                key={u.id}
                title={u.name}
                active={payer === u.id}
                onPress={() => setPayer(u.id)}
              />
            ))}
          </View>
          <Section title="누구와 나눌까요?" />
          <View style={s.wrap}>
            {people.map((u) => (
              <Chip
                key={u.id}
                title={u.name}
                active={selectedMembers.includes(u.id)}
                onPress={() => toggleMember(u.id)}
              />
            ))}
          </View>
          <Section title="분담 방법" />
          <View style={[s.wrap, { marginBottom: 20 }]}>
            {["균등 분할", "직접 지정"].map((v) => (
              <Chip
                key={v}
                title={v}
                active={split === v}
                onPress={() => setSplit(v)}
              />
            ))}
          </View>
          {people
            .filter((u) => selectedMembers.includes(u.id))
            .map((u) =>
              split === "직접 지정" ? (
                <Field
                  key={u.id}
                  title={`${u.name} 부담액 (원)`}
                  value={custom[u.id] ?? ""}
                  onChangeText={(value) =>
                    setCustom((c) => ({ ...c, [u.id]: value }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                />
              ) : (
                <View key={u.id} style={[s.between, { marginBottom: 10 }]}>
                  <Text style={s.body}>{u.name}</Text>
                  <Text style={s.strong}>{money(shares[u.id] ?? 0)}</Text>
                </View>
              ),
            )}
          <Text style={[s.small, { marginBottom: 20 }]}>
            합계{" "}
            {money(
              Object.values(shares).reduce(
                (sum, n) => sum + (Number.isFinite(n) ? n : 0),
                0,
              ),
            )}{" "}
            · {selectedMembers.length}명 분담{"\n"}균등 분할의 1원 단위 잔액은
            멤버 순서로 나눠요.
          </Text>
          {field("note", "메모", "", { multiline: true })}
        </>
      )}
      {kind === "parties" && (
        <>
          <Section title="함께할 멤버" />
          <View style={s.wrap}>
            {people.map((u) => (
              <Chip
                key={u.id}
                title={u.name}
                active={selectedMembers.includes(u.id)}
                onPress={() => toggleMember(u.id)}
              />
            ))}
          </View>
        </>
      )}
      {kind === "checklist" && (
        <>
          <Section title="누가 준비하나요?" />
          <View style={s.wrap}>
            <Chip
              title="공용 준비물"
              active={!owner}
              onPress={() => setOwner(null)}
            />
            {people.map((u) => (
              <Chip
                key={u.id}
                title={u.name}
                active={owner === u.id}
                onPress={() => setOwner(u.id)}
              />
            ))}
          </View>
        </>
      )}
      {kind === "notices" && (
        <>
          {field(
            "body",
            "공지 내용",
            "집합 장소와 시간 등 꼭 알아둘 내용을 남겨 주세요.",
            { multiline: true },
          )}
          <Chip
            title="상단에 고정"
            active={pinned}
            onPress={() => setPinned((value) => !value)}
          />
        </>
      )}
      {kind === "settings" && (
        <>
          {field("destination", "목적지")}
          {field("startDate", "출발일 (YYYY-MM-DD)")}
          {field("endDate", "마지막 날 (YYYY-MM-DD)")}
          {field("budget", "예산 (원)", "", { keyboardType: "number-pad" })}
          <Section title="여행 상태" />
          <View style={s.wrap}>
            <Chip
              title="함께할 여행"
              active={!archived}
              onPress={() => setArchived(false)}
            />
            <Chip
              title="여행 종료"
              active={archived}
              onPress={() => setArchived(true)}
            />
          </View>
        </>
      )}
      <ErrorMessage message={error} />
      <View style={{ gap: 12, marginTop: 28 }}>
        <Button
          title="저장하기"
          loading={busy}
          disabled={trip.archived && kind !== "settings"}
          onPress={() => void save()}
        />
        {itemId && kind !== "settings" && (
          <Button
            title={`${titles[kind]} 삭제`}
            danger
            disabled={busy || trip.archived}
            onPress={() => setConfirm(true)}
          />
        )}
      </View>
      <Confirm
        visible={confirm}
        title={`${titles[kind]}를 삭제할까요?`}
        description="이 항목은 여행 목록에서 삭제됩니다. 연결된 정보가 있으면 삭제가 제한될 수 있어요."
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void remove()}
      />
    </Page>
  );
}
