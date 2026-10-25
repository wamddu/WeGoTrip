import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import { PlaceSearch } from "./place-search";
import { SelectField } from "../../ui/select-field";
import { RepositoryConflictError } from "../../data/user-travel-repository";
import { ApiError } from "../../data/user-api";
import { ExpenseForm } from "./expense-form";
import { NoticeEditor } from "./notice-editor";

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
  const openedItem = useRef<{ key: string; exists: boolean } | null>(null);
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
  if (kind === "notices")
    return (
      <NoticeEditor
        key={`${trip.id}-${params.itemId ?? "new"}`}
        trip={trip}
        itemId={params.itemId}
      />
    );
  const editorKey = `${trip.id}-${kind}-${params.itemId ?? "new"}`;
  const checklistUnassigned =
    kind === "checklist" &&
    trip.checklist.some(
      (item) => item.id === params.itemId && item.ownerId === null,
    );
  if (openedItem.current?.key !== editorKey)
    openedItem.current = {
      key: editorKey,
      exists:
        kind === "settings" ||
        trip[kind].some((item) => item.id === params.itemId),
    };
  if (
    params.itemId &&
    kind !== "settings" &&
    (checklistUnassigned ||
      (!trip[kind].some((i) => i.id === params.itemId) &&
        !openedItem.current.exists))
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
      key={editorKey}
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
  const { date, partyId, data, session, execute, busy, loading, tripApi } =
    useTrip();
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
    date: string("date", date),
    startDate: string("startDate", trip.startDate),
    endDate: string("endDate", trip.endDate),
    startTime: string("startTime", "09:00"),
    endTime: string("endTime", "10:00"),
    amount: string("amount"),
    budget: string("budget", String(trip.budget)),
    address: string("address"),
    googlePlaceId: string("googlePlaceId"),
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
  const [placeSelectionChanged, setPlaceSelectionChanged] = useState(false);
  const selectPlace = (id: string | null) => {
    setSelectedPlace(id);
    setPlaceSelectionChanged(true);
  };
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
  const [version] = useState(trip.serverVersion);
  const [settlementRevision, setSettlementRevision] = useState(
    trip.settlementRevision,
  );
  const [error, setError] = useState("");
  const [checklistStateToken, setChecklistStateToken] = useState<
    string | undefined
  >(typeof initial.stateToken === "string" ? initial.stateToken : undefined);
  const [checklistConflict, setChecklistConflict] = useState(false);
  const [checklistExpired, setChecklistExpired] = useState(false);
  const [checklistRetry, setChecklistRetry] = useState<Command | null>(null);
  const checklistMissing = kind === "checklist" && !!itemId && !existing;
  const checklistDisabled =
    busy || loading || trip.archived || checklistMissing || checklistExpired;
  const [confirm, setConfirm] = useState(false);
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
        ? { latitude: "", longitude: "", googlePlaceId: "" }
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
      {...(kind === "checklist"
        ? { editable: !checklistDisabled && !checklistRetry }
        : {})}
      maxLength={
        key === "body"
          ? 3000
          : key === "note"
            ? kind === "agenda" || kind === "places"
              ? 3000
              : 1000
            : key === "address" && kind === "places"
              ? 255
              : key === "title" && (kind === "agenda" || kind === "places")
                ? 100
                : 150
      }
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
  function checklistError(error: unknown, command?: Command) {
    if (kind !== "checklist") return;
    if (error instanceof RepositoryConflictError) {
      const latest = error.workspace.trips
        .find((item) => item.id === trip.id)
        ?.checklist.find((item) => item.id === itemId);
      setChecklistStateToken(latest?.stateToken);
      setChecklistConflict(true);
      if (error.code === "PACKING_RETRY_EXPIRED") setChecklistExpired(true);
      setChecklistRetry(null);
    } else if (
      tripApi &&
      command &&
      (!(error instanceof ApiError) || error.status >= 500)
    ) {
      setChecklistRetry(command);
    } else setChecklistRetry(null);
  }
  async function retryChecklist() {
    if (!checklistRetry || busy || loading) return;
    setError("");
    try {
      await execute(checklistRetry);
      setChecklistRetry(null);
      leave();
    } catch (error) {
      checklistError(error, checklistRetry);
      setError(
        error instanceof Error
          ? error.message
          : "저장 결과를 확인하지 못했어요.",
      );
    }
  }
  async function save() {
    if (busy || loading || checklistRetry || checklistExpired) return;
    if (checklistMissing) {
      setError(
        "다른 멤버가 삭제한 준비물이에요. 입력한 내용은 유지되며 목록에서 다시 확인해 주세요.",
      );
      return;
    }
    setError("");
    const id = itemId ?? uid();
    const authorId = session!.user.id;
    const createdAt = new Date().toISOString();
    let command: Command | undefined;
    try {
      if (
        kind === "checklist" &&
        (!form.title.trim() ||
          form.title.trim().length > 150 ||
          (!!itemId && owner === null) ||
          (owner !== null && !trip.memberIds.includes(owner)))
      )
        throw new Error(
          "준비물 이름은 1~150자로 입력하고 현재 여행 멤버를 담당자로 선택해 주세요.",
        );
      if (
        kind === "agenda" &&
        string("placeName") &&
        !string("placeId") &&
        !selectedPlace &&
        !placeSelectionChanged
      )
        throw new Error(
          "기존 장소를 저장 장소에 다시 연결해 주세요. 장소를 지우려면 '장소 미정'을 선택해 주세요.",
        );
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
              googlePlaceId: form.googlePlaceId || undefined,
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
            settlementRevision,
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
              stateToken: checklistStateToken,
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
            },
          };
          break;
        case "settings":
          command = {
            type: "trip.update",
            version,
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
      if (kind === "expenses" && e instanceof RepositoryConflictError)
        setSettlementRevision(
          e.workspace.trips.find((item) => item.id === trip.id)
            ?.settlementRevision,
        );
      checklistError(e, command);
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했어요. 입력한 내용을 확인해 주세요.",
      );
    }
  }
  async function remove() {
    if (
      !itemId ||
      kind === "settings" ||
      busy ||
      loading ||
      checklistMissing ||
      checklistExpired ||
      checklistRetry
    )
      return;
    const command: Command = {
      type: "item.delete",
      tripId: trip.id,
      collection: kind,
      itemId,
      settlementRevision: kind === "expenses" ? settlementRevision : undefined,
      expectedStateToken:
        kind === "checklist" ? checklistStateToken : undefined,
    };
    try {
      await execute(command);
      setConfirm(false);
      leave();
    } catch (e) {
      if (kind === "expenses" && e instanceof RepositoryConflictError)
        setSettlementRevision(
          e.workspace.trips.find((item) => item.id === trip.id)
            ?.settlementRevision,
        );
      checklistError(e, command);
      setConfirm(false);
      setError((e as Error).message);
    }
  }
  function selectParty(id: string | null) {
    setSelectedParty(id);
    const party = trip.parties.find((p) => p.id === id);
    if (party && kind === "expenses") setSelectedMembers([...party.memberIds]);
  }
  function changeExpense(update: () => void) {
    setError("");
    update();
  }
  return (
    <Page
      title={`${titles[kind]} ${kind === "settings" ? "" : itemId ? "수정" : "추가"}`}
      back
      navigation={false}
      footer={
        kind === "expenses" ? (
          <View style={expenseStyles.footer}>
            <View style={s.between}>
              <Text style={s.small}>기록할 지출</Text>
              <Text style={expenseStyles.total}>
                {Number.isSafeInteger(numericAmount) && numericAmount > 0
                  ? money(numericAmount)
                  : "금액을 입력해 주세요"}
              </Text>
            </View>
            <ErrorMessage message={error} />
            <Button
              title={itemId ? "수정 내용 저장하기" : "지출 저장하기"}
              icon="check"
              loading={busy}
              disabled={trip.archived}
              onPress={() => void save()}
            />
          </View>
        ) : undefined
      }
    >
      {trip.archived && kind !== "settings" && (
        <ErrorMessage message="종료한 여행이에요. 여행 설정에서 다시 열어 주세요." />
      )}
      {checklistMissing && (
        <ErrorMessage message="다른 멤버가 삭제한 준비물이에요. 입력한 내용은 유지되며 목록에서 다시 확인해 주세요." />
      )}
      {kind === "checklist" &&
        checklistConflict &&
        !checklistExpired &&
        existing && (
          <Text style={[s.small, { marginBottom: 16 }]}>
            입력한 내용은 그대로 유지했어요. 현재 공유된 준비물은 ‘
            {string("title")}’ ·{" "}
            {people.find((person) => person.id === initial.ownerId)?.name ??
              "여행 멤버"}
            · {initial.done ? "준비 완료" : "미완료"} 상태예요. 확인 후 다시
            저장해 주세요.
          </Text>
        )}
      {kind !== "places" &&
        kind !== "expenses" &&
        field(
          "title",
          kind === "parties"
            ? "파티 이름"
            : kind === "checklist"
              ? "준비물 이름"
              : kind === "settings"
                ? "여행 이름"
                : `${titles[kind]} 제목`,
        )}
      {kind === "agenda" && field("date", "날짜 (YYYY-MM-DD)")}
      {kind === "agenda" && (
        <>
          <View style={s.row}>
            <View style={s.flex}>
              {field("startTime", "시작 시간 (HH:MM)")}
            </View>
            <View style={s.flex}>{field("endTime", "종료 시간 (HH:MM)")}</View>
          </View>
        </>
      )}
      {kind === "agenda" && (
        <SelectField
          title="파티 선택"
          value={selectedParty}
          options={[
            {
              value: null,
              label: "모두 함께",
              description: `여행 멤버 전체 · ${trip.memberIds.length}명`,
            },
            ...trip.parties.map((party) => ({
              value: party.id,
              label: party.name,
              description: `${party.memberIds.length}명 참여`,
            })),
          ]}
          onChange={selectParty}
          icon="users"
          searchPlaceholder="파티 이름 검색"
          emptyText="일치하는 파티가 없어요."
          disabled={busy || trip.archived}
        />
      )}
      {kind === "agenda" && (
        <>
          <SelectField
            title="저장 장소 연결"
            value={selectedPlace}
            options={[
              {
                value: null,
                label: "장소 미정",
                description: "나중에도 연결할 수 있어요",
              },
              ...trip.places.map((place) => ({
                value: place.id,
                label: place.name,
                description: place.address,
              })),
            ]}
            onChange={selectPlace}
            icon="pin"
            searchPlaceholder="장소 이름이나 주소 검색"
            emptyText="일치하는 저장 장소가 없어요."
            hint={
              string("placeName") &&
              !string("placeId") &&
              !selectedPlace &&
              !placeSelectionChanged
                ? `기존 장소: ${string("placeName")} · 저장 장소에 연결하거나 '장소 미정'을 선택해 주세요.`
                : undefined
            }
            disabled={busy || trip.archived}
          />
          {field("note", "메모", "함께 알아두면 좋은 내용", {
            multiline: true,
          })}
        </>
      )}
      {kind === "places" && (
        <>
          <PlaceSearch
            onSelect={(place) => {
              setForm((current) => ({
                ...current,
                title: place.name,
                address: place.address,
                latitude: String(place.coordinates.latitude),
                longitude: String(place.coordinates.longitude),
                googlePlaceId: place.id,
                category: place.category,
              }));
            }}
          />
          {field("title", "장소 이름")}
          {field("address", "주소")}
          {hasCoordinates && (
            <View style={{ marginVertical: 12 }}>
              <Text style={[s.strong, { marginBottom: 10 }]}>선택한 장소</Text>
              <GeographicMap
                key={`${form.latitude}:${form.longitude}`}
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
              />
            </View>
          )}
          {hasCoordinates && (
            <Button
              title="위치 지우기"
              secondary
              onPress={() =>
                setForm((current) => ({
                  ...current,
                  latitude: "",
                  longitude: "",
                  googlePlaceId: "",
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
        <ExpenseForm
          form={{
            title: form.title,
            date: form.date,
            amount: form.amount,
            note: form.note,
          }}
          people={people}
          parties={trip.parties}
          payer={payer}
          selectedParty={selectedParty}
          selectedMembers={selectedMembers}
          split={split}
          custom={custom}
          shares={shares}
          numericAmount={numericAmount}
          disabled={busy || trip.archived}
          onPatch={(key, value) => changeExpense(() => patch(key, value))}
          onSelectParty={(id) => changeExpense(() => selectParty(id))}
          onPayerChange={(id) => changeExpense(() => setPayer(id))}
          onMembersChange={(ids) =>
            changeExpense(() => setSelectedMembers(ids))
          }
          onSplitChange={(value) => changeExpense(() => setSplit(value))}
          onCustomChange={(id, value) =>
            changeExpense(() =>
              setCustom((current) => ({ ...current, [id]: value })),
            )
          }
        />
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
        <SelectField
          title="누가 준비하나요?"
          value={owner}
          options={[
            ...(!itemId
              ? [
                  {
                    value: null,
                    label: "모든 멤버가 각자 준비",
                    description: `${trip.memberIds.length}명에게 개인 준비물이 하나씩 추가돼요`,
                  },
                ]
              : []),
            ...people.map((person) => ({
              value: person.id,
              label: person.name,
              description:
                person.id === session!.user.id
                  ? "내가 담당해요"
                  : "이 멤버가 담당해요",
            })),
          ]}
          onChange={setOwner}
          icon="users"
          placeholder="담당자를 선택해 주세요"
          searchPlaceholder="담당자 이름 검색"
          emptyText="일치하는 여행 멤버가 없어요."
          hint={
            !itemId && owner === null
              ? `현재 여행 멤버 ${trip.memberIds.length}명에게 같은 이름의 준비물을 각각 추가해요. 각자 체크한 결과를 모두 함께 볼 수 있어요.`
              : "모든 멤버가 목록을 볼 수 있고, 담당자만 체크할 수 있어요. 이 항목의 수정·삭제는 해당 담당자의 준비물에만 반영돼요."
          }
          disabled={checklistDisabled || !!checklistRetry}
        />
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
          {trip.serverVersion !== undefined && trip.archived && (
            <Text style={s.small}>
              먼저 여행 상태를 함께할 여행으로 변경해 저장한 뒤 정보를 수정해
              주세요.
            </Text>
          )}
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
      {kind !== "expenses" && <ErrorMessage message={error} />}
      {kind === "checklist" && checklistExpired && (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Text style={s.small}>
            이전 요청의 확인 기간이 지났어요. 입력한 내용은 유지했으니 최신
            목록에서 이미 등록되었는지 확인한 뒤 다시 추가하거나 수정해 주세요.
          </Text>
          <Button
            title="최신 준비물 목록 확인하기"
            secondary
            disabled={busy || loading}
            onPress={() => router.replace(`/trip/${trip.id}/checklist`)}
          />
        </View>
      )}
      {kind === "checklist" && checklistRetry && (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Text style={s.small}>
            저장 결과를 확인하지 못했어요. 입력한 내용을 유지하고 같은 요청으로
            다시 확인하면 중복 등록을 막을 수 있어요.
          </Text>
          <Button
            title="이전 요청 다시 확인하기"
            secondary
            loading={busy}
            disabled={loading}
            onPress={() => void retryChecklist()}
          />
        </View>
      )}
      {trip.serverVersion !== undefined && kind === "checklist" && (
        <Text style={s.small}>준비물은 여행 멤버들과 함께 공유돼요.</Text>
      )}
      {trip.serverVersion !== undefined && kind === "notices" && (
        <Text style={s.small}>
          이 내용은 현재 이 기기에만 저장되며 다른 멤버에게 공유되지 않아요.
        </Text>
      )}
      {(kind !== "expenses" || itemId) && (
        <View style={{ gap: 12, marginTop: 28 }}>
          {kind !== "expenses" && (
            <Button
              title={
                kind === "checklist" && checklistConflict && !checklistExpired
                  ? "확인 후 다시 저장하기"
                  : "저장하기"
              }
              loading={busy}
              disabled={
                (trip.archived && kind !== "settings") ||
                (kind === "checklist" &&
                  (checklistDisabled || !!checklistRetry))
              }
              onPress={() => void save()}
            />
          )}
          {itemId && kind !== "settings" && (
            <Button
              title={`${titles[kind]} 삭제`}
              danger
              disabled={
                busy ||
                trip.archived ||
                (kind === "checklist" &&
                  (checklistDisabled || !!checklistRetry))
              }
              onPress={() => setConfirm(true)}
            />
          )}
        </View>
      )}
      <Confirm
        visible={confirm}
        title={
          kind === "checklist"
            ? "준비물을 삭제할까요?"
            : `${titles[kind]}를 삭제할까요?`
        }
        description={
          kind === "checklist"
            ? "이 담당자의 준비물 항목 하나가 삭제돼요. 다른 멤버에게 배정된 준비물은 유지돼요."
            : "이 항목은 여행 목록에서 삭제됩니다. 연결된 정보가 있으면 삭제가 제한될 수 있어요."
        }
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void remove()}
      />
    </Page>
  );
}

const expenseStyles = StyleSheet.create({
  footer: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: p.white,
    borderTopWidth: 1,
    borderTopColor: p.border,
  },
  total: { color: p.ink, fontSize: 16, fontWeight: "700", flexShrink: 1 },
});
