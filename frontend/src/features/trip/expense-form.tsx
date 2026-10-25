import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { money, type Party, type User } from "../../domain/models";
import { Avatar, Field, Icon } from "../../ui/components";
import { SelectField } from "../../ui/select-field";
import { palette as p } from "../../ui/theme";

export interface ExpenseFormProps {
  form: { title: string; date: string; amount: string; note: string };
  people: User[];
  parties: Party[];
  payer: string;
  selectedParty: string | null;
  selectedMembers: string[];
  split: string;
  custom: Record<string, string>;
  shares: Record<string, number>;
  numericAmount: number;
  disabled: boolean;
  onPatch(key: string, value: string): void;
  onSelectParty(id: string | null): void;
  onPayerChange(id: string): void;
  onMembersChange(ids: string[]): void;
  onSplitChange(value: string): void;
  onCustomChange(id: string, value: string): void;
}

export function ExpenseForm({
  form,
  people,
  parties,
  payer,
  selectedParty,
  selectedMembers,
  split,
  custom,
  shares,
  numericAmount,
  disabled,
  onPatch,
  onSelectParty,
  onPayerChange,
  onMembersChange,
  onSplitChange,
  onCustomChange,
}: ExpenseFormProps) {
  const { width } = useWindowDimensions();
  const stackedCustomInput = width < 360 && split === "직접 지정";
  const selectedPeople = people.filter((person) =>
    selectedMembers.includes(person.id),
  );
  const allSelected =
    people.length > 0 &&
    people.every((person) => selectedMembers.includes(person.id));
  const hasAmount =
    Number.isSafeInteger(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= 1_000_000_000;
  const validShares = selectedPeople.every(
    (person) =>
      Number.isSafeInteger(shares[person.id]) &&
      shares[person.id] >= 0 &&
      shares[person.id] <= 1_000_000_000,
  );
  const shareTotal = Object.values(shares).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  const remaining = hasAmount ? numericAmount - shareTotal : 0;
  const balanced =
    hasAmount && selectedPeople.length > 0 && validShares && remaining === 0;
  const needsAdjustment =
    hasAmount && selectedPeople.length > 0 && (!validShares || remaining !== 0);
  const summary = !hasAmount
    ? form.amount.trim()
      ? "지출 금액은 1원부터 10억원까지 입력해 주세요."
      : "지출 금액을 입력해 주세요."
    : !selectedPeople.length
      ? "함께 부담할 멤버를 선택해 주세요."
      : !validShares
        ? "멤버별 부담 금액을 확인해 주세요."
        : balanced
          ? "지출 금액과 분담 합계가 같아요."
          : remaining > 0
            ? `${money(remaining)}을 더 배분해 주세요.`
            : `${money(Math.abs(remaining))} 초과했어요. 분담 금액을 줄여 주세요.`;

  return (
    <View style={st.form}>
      <View style={st.amountCard}>
        <View style={st.amountHeader}>
          <View style={st.amountLabel}>
            <Icon name="wallet" size={18} color={p.primary} />
            <Text style={st.amountTitle}>총 지출 금액</Text>
          </View>
          <Text style={st.currencyBadge}>KRW</Text>
        </View>
        <View style={st.amountEntry}>
          <TextInput
            accessibilityLabel="총 지출 금액 (원)"
            accessibilityState={{ disabled }}
            value={form.amount}
            onChangeText={(value) => onPatch("amount", value)}
            placeholder="0"
            placeholderTextColor="#96B7E0"
            keyboardType="number-pad"
            editable={!disabled}
            maxLength={14}
            style={[
              st.amountInput,
              form.amount.length > 11 && { fontSize: 28 },
              disabled && st.disabled,
            ]}
          />
          <Text style={st.won}>원</Text>
        </View>
        <Text style={st.amountHint}>
          한 사람이 결제한 전체 금액을 입력해 주세요
        </Text>
      </View>

      <View style={st.card}>
        <View style={st.cardHeader}>
          <View style={st.sectionIcon}>
            <Icon name="edit" color={p.primary} size={19} />
          </View>
          <View style={st.flex}>
            <Text accessibilityRole="header" style={st.heading}>
              지출 정보
            </Text>
            <Text style={st.caption}>무엇에 사용한 비용인가요?</Text>
          </View>
        </View>
        <Field
          title="지출 제목"
          value={form.title}
          onChangeText={(value) => onPatch("title", value)}
          placeholder="예: 함께 먹은 저녁 식사"
          maxLength={150}
          editable={!disabled}
          accessibilityState={{ disabled }}
          style={[st.fieldInput, disabled && st.disabled]}
        />
        <View style={st.dateField}>
          <Text style={st.label}>지출 날짜</Text>
          <View style={[st.dateEntry, disabled && st.disabled]}>
            <Icon name="calendar" color={p.secondary} size={20} />
            <TextInput
              accessibilityLabel="지출 날짜 (YYYY-MM-DD)"
              accessibilityState={{ disabled }}
              value={form.date}
              onChangeText={(value) => onPatch("date", value)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9BAABD"
              maxLength={10}
              editable={!disabled}
              autoCorrect={false}
              style={st.dateInput}
            />
          </View>
        </View>
        <SelectField
          title="어떤 소그룹의 지출인가요?"
          value={selectedParty}
          options={[
            {
              value: null,
              label: "공동 지출",
              description: "함께 부담할 멤버를 자유롭게 선택해요",
            },
            ...parties.map((party) => ({
              value: party.id,
              label: party.name,
              description: `${party.memberIds.length}명으로 구성된 소그룹`,
            })),
          ]}
          onChange={onSelectParty}
          icon="users"
          searchPlaceholder="소그룹 이름 검색"
          disabled={disabled}
        />
      </View>

      <View style={st.card}>
        <View style={st.cardHeader}>
          <View style={st.sectionIcon}>
            <Icon name="users" color={p.primary} size={19} />
          </View>
          <View style={st.flex}>
            <Text accessibilityRole="header" style={st.heading}>
              함께 나누기
            </Text>
            <Text style={st.caption}>결제한 사람과 부담할 멤버를 선택해요</Text>
          </View>
        </View>
        <SelectField
          title="누가 결제했나요?"
          value={payer}
          options={people.map((person) => ({
            value: person.id,
            label: person.name,
            description: "이 지출의 전체 금액을 결제한 멤버",
          }))}
          onChange={(id) => {
            if (id !== null) onPayerChange(id);
          }}
          icon="wallet"
          searchPlaceholder="멤버 이름 검색"
          disabled={disabled}
        />
        <View style={st.memberHeading}>
          <View style={st.memberLabel}>
            <Text style={st.label}>함께 부담할 멤버</Text>
            <View style={st.countBadge}>
              <Text style={st.countText}>{selectedPeople.length}명</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              allSelected ? "분담 멤버 전체 해제" : "분담 멤버 전체 선택"
            }
            accessibilityState={{ disabled }}
            disabled={disabled || !people.length}
            onPress={() =>
              onMembersChange(
                allSelected ? [] : people.map((person) => person.id),
              )
            }
            style={({ pressed }) => [
              st.selectAll,
              (pressed || disabled) && st.disabled,
            ]}
          >
            <Text style={st.selectAllText}>
              {allSelected ? "전체 해제" : "전체 선택"}
            </Text>
          </Pressable>
        </View>
        <View style={st.memberList}>
          {people.map((person) => {
            const selected = selectedMembers.includes(person.id);
            return (
              <Pressable
                key={person.id}
                accessibilityRole="checkbox"
                accessibilityLabel={`${person.name} 분담 참여`}
                accessibilityState={{ checked: selected, disabled }}
                disabled={disabled}
                onPress={() =>
                  onMembersChange(
                    selected
                      ? selectedMembers.filter((id) => id !== person.id)
                      : [...selectedMembers, person.id],
                  )
                }
                style={({ pressed }) => [
                  st.memberRow,
                  selected && st.selectedMember,
                  (pressed || disabled) && st.disabled,
                ]}
              >
                <Avatar user={person} size={36} />
                <View style={st.flex}>
                  <Text style={st.memberName}>{person.name}</Text>
                  {person.id === payer && (
                    <Text style={st.payerLabel}>결제자</Text>
                  )}
                </View>
                <View style={[st.checkbox, selected && st.checked]}>
                  {selected && <Icon name="check" color={p.white} size={14} />}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={st.memberHint}>
          결제한 사람도 함께 부담할 멤버에 포함할 수 있어요.
        </Text>
      </View>

      <View style={st.card}>
        <View style={st.cardHeader}>
          <View style={[st.sectionIcon, { backgroundColor: p.mintSoft }]}>
            <Icon name="wallet" color="#15857F" size={19} />
          </View>
          <View style={st.flex}>
            <Text accessibilityRole="header" style={st.heading}>
              분담 금액
            </Text>
            <Text style={st.caption}>각 멤버가 부담할 금액을 확인해요</Text>
          </View>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="분담 방식"
          style={st.segmented}
        >
          {["균등 분할", "직접 지정"].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={value}
              accessibilityState={{ checked: split === value, disabled }}
              disabled={disabled}
              onPress={() => onSplitChange(value)}
              style={({ pressed }) => [
                st.segment,
                split === value && st.activeSegment,
                (pressed || disabled) && st.disabled,
              ]}
            >
              <Text
                style={[
                  st.segmentText,
                  split === value && st.activeSegmentText,
                ]}
              >
                {value}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={st.splitHint}>
          {split === "균등 분할"
            ? "선택한 멤버끼리 자동으로 나눠요."
            : "멤버별로 부담할 금액을 입력해 주세요."}
        </Text>
        {selectedPeople.length ? (
          <View style={st.shares}>
            {selectedPeople.map((person, index) => (
              <View
                key={person.id}
                style={[
                  st.shareRow,
                  stackedCustomInput && st.stackedShareRow,
                  index > 0 && st.shareDivider,
                ]}
              >
                <Avatar user={person} size={30} />
                <Text style={[st.memberName, st.flex]}>{person.name}</Text>
                {split === "직접 지정" ? (
                  <View
                    style={[
                      st.customEntry,
                      stackedCustomInput && st.fullWidthCustomEntry,
                      disabled && st.disabled,
                    ]}
                  >
                    <TextInput
                      accessibilityLabel={`${person.name} 부담 금액 (원)`}
                      accessibilityState={{ disabled }}
                      value={custom[person.id] ?? ""}
                      onChangeText={(value) => onCustomChange(person.id, value)}
                      placeholder="0"
                      placeholderTextColor="#9BAABD"
                      keyboardType="number-pad"
                      maxLength={14}
                      editable={!disabled}
                      style={st.customInput}
                    />
                    <Text style={st.customWon}>원</Text>
                  </View>
                ) : (
                  <Text style={st.shareAmount}>
                    {hasAmount && Number.isFinite(shares[person.id])
                      ? money(shares[person.id])
                      : "—"}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={st.noMembers}>
            <Icon name="users" color={p.secondary} size={22} />
            <Text style={st.noMembersText}>
              멤버를 선택하면 분담 금액이 나타나요
            </Text>
          </View>
        )}
        <View
          style={[
            st.summary,
            balanced && st.balancedSummary,
            needsAdjustment && st.adjustmentSummary,
          ]}
        >
          <View style={st.summaryTop}>
            <Text style={st.summaryLabel}>분담 합계</Text>
            <Text style={[st.summaryAmount, balanced && { color: "#15857F" }]}>
              {hasAmount && validShares && selectedPeople.length
                ? money(shareTotal)
                : "—"}
            </Text>
          </View>
          <View style={st.summaryMessage}>
            <Icon
              name={balanced ? "check" : needsAdjustment ? "notice" : "wallet"}
              size={16}
              color={
                balanced ? "#15857F" : needsAdjustment ? p.red : p.secondary
              }
            />
            <Text
              accessibilityLiveRegion="polite"
              style={[
                st.summaryHint,
                balanced && { color: "#15857F" },
                needsAdjustment && { color: p.red },
              ]}
            >
              {summary}
            </Text>
          </View>
        </View>
        {split === "균등 분할" && selectedPeople.length > 1 && (
          <Text style={st.roundingHint}>
            1원 단위의 차이는 멤버 순서대로 나눠요.
          </Text>
        )}
      </View>

      <View style={st.card}>
        <View style={st.memoHeader}>
          <Text accessibilityRole="header" style={st.heading}>
            메모
          </Text>
          <Text style={st.optional}>선택</Text>
        </View>
        <TextInput
          accessibilityLabel="지출 메모 (선택)"
          accessibilityState={{ disabled }}
          value={form.note}
          onChangeText={(value) => onPatch("note", value)}
          placeholder="정산할 때 기억해 둘 내용을 남겨 주세요"
          placeholderTextColor="#9BAABD"
          multiline
          maxLength={1000}
          editable={!disabled}
          textAlignVertical="top"
          style={[st.memoInput, disabled && st.disabled]}
        />
        <Text style={st.characterCount}>
          {form.note.length.toLocaleString("ko-KR")} / 1,000
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  form: { gap: 18 },
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.55 },
  amountCard: {
    backgroundColor: p.blueSoft,
    borderColor: "#D3E6FE",
    borderWidth: 1,
    borderRadius: 23,
    padding: 20,
  },
  amountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  amountLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  amountTitle: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: p.primaryDark,
  },
  currencyBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: p.primary,
    backgroundColor: p.white,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  amountEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 17,
    marginBottom: 10,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 53,
    paddingVertical: 4,
    paddingHorizontal: 0,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
    color: p.ink,
    fontVariant: ["tabular-nums"],
  },
  won: { fontSize: 21, fontWeight: "600", color: p.primaryDark },
  amountHint: { fontSize: 12, lineHeight: 19, color: "#597A9F" },
  card: {
    backgroundColor: p.white,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: p.border,
    padding: 17,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.blueSoft,
  },
  heading: {
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.4,
    fontWeight: "700",
    color: p.ink,
  },
  caption: { fontSize: 12, lineHeight: 18, marginTop: 3, color: p.secondary },
  label: { fontSize: 12, lineHeight: 18, color: p.ink, fontWeight: "600" },
  fieldInput: { backgroundColor: p.bg, fontSize: 14, minHeight: 50 },
  dateField: { gap: 8, marginBottom: 18 },
  dateEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: p.border,
    backgroundColor: p.bg,
    borderRadius: 13,
    paddingHorizontal: 14,
  },
  dateInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    minHeight: 50,
    fontSize: 14,
    color: p.ink,
  },
  memberHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  memberLabel: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 7,
  },
  countBadge: {
    backgroundColor: p.blueSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  countText: { color: p.primary, fontSize: 11, fontWeight: "700" },
  selectAll: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  selectAllText: { color: p.primary, fontSize: 12, fontWeight: "600" },
  memberList: { gap: 7 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: p.border,
    minHeight: 58,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  selectedMember: { backgroundColor: "#F1F7FF", borderColor: "#CAE0FD" },
  memberName: { fontSize: 14, lineHeight: 21, fontWeight: "600", color: p.ink },
  payerLabel: { marginTop: 2, fontSize: 11, lineHeight: 16, color: p.primary },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CCD9E8",
    backgroundColor: p.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { borderColor: p.primary, backgroundColor: p.primary },
  memberHint: {
    fontSize: 11,
    lineHeight: 18,
    color: p.secondary,
    marginTop: 12,
  },
  segmented: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: p.bg,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 7,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  activeSegment: { backgroundColor: p.white, borderColor: "#D3E4F8" },
  segmentText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: p.secondary,
  },
  activeSegmentText: { color: p.primary },
  splitHint: {
    fontSize: 12,
    lineHeight: 19,
    color: p.secondary,
    marginTop: 11,
    marginBottom: 10,
  },
  shares: { marginBottom: 15 },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 62,
    paddingVertical: 10,
  },
  stackedShareRow: { flexWrap: "wrap", rowGap: 9 },
  shareDivider: { borderTopWidth: 1, borderTopColor: p.border },
  shareAmount: {
    flexShrink: 1,
    color: p.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  customEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    width: "48%",
    maxWidth: 165,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: p.border,
    backgroundColor: p.bg,
    paddingHorizontal: 9,
  },
  fullWidthCustomEntry: { width: "100%", maxWidth: "100%" },
  customInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 9,
    paddingHorizontal: 0,
    textAlign: "right",
    fontSize: 13,
    color: p.ink,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  customWon: { color: p.secondary, fontSize: 12 },
  noMembers: {
    alignItems: "center",
    gap: 9,
    paddingVertical: 22,
    paddingHorizontal: 8,
  },
  noMembersText: {
    textAlign: "center",
    color: p.secondary,
    fontSize: 12,
    lineHeight: 19,
  },
  summary: {
    backgroundColor: p.bg,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 14,
    padding: 13,
  },
  balancedSummary: { backgroundColor: p.mintSoft, borderColor: "#C7EBE3" },
  adjustmentSummary: { backgroundColor: p.coralSoft, borderColor: "#F6DACE" },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryLabel: { fontSize: 12, fontWeight: "600", color: p.ink },
  summaryAmount: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "700",
    color: p.ink,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  summaryMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
  },
  summaryHint: { flex: 1, fontSize: 11, lineHeight: 17, color: p.secondary },
  roundingHint: {
    fontSize: 11,
    lineHeight: 17,
    color: p.secondary,
    marginTop: 10,
  },
  memoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 13,
  },
  optional: {
    color: p.secondary,
    fontSize: 11,
    backgroundColor: p.bg,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  memoInput: {
    minHeight: 103,
    backgroundColor: p.bg,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: 13,
    padding: 13,
    fontSize: 13,
    lineHeight: 21,
    color: p.ink,
    textAlignVertical: "top",
  },
  characterCount: {
    fontSize: 10,
    color: p.secondary,
    textAlign: "right",
    marginTop: 8,
  },
});
