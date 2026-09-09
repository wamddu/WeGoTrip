import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { calculateSettlement, money } from "../../domain/models";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorMessage,
  Section,
  styles as s,
} from "../../ui/components";
import { palette as p } from "../../ui/theme";
import { editHref, PartyFilter } from "./shared";
import { useTrip } from "./trip-context";

export function ExpenseSection() {
  const { trip: t, data, session, execute, busy, partyId } = useTrip();
  const trip = t!;
  const [view, setView] = useState("지출 내역");
  const [error, setError] = useState("");
  const totals = calculateSettlement(trip);
  const mine = totals.balances[session!.user.id];
  const expenses = trip.expenses
    .filter((e) => !partyId || e.partyId === partyId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const user = (id: string) => data!.users.find((u) => u.id === id);
  return (
    <>
      <View style={st.summary}>
        <Text style={st.label}>우리 여행의 총 지출</Text>
        <Text style={st.amount}>{money(totals.total)}</Text>
        <View style={st.line} />
        <View style={s.between}>
          <Text style={st.label}>내 부담액</Text>
          <Text style={st.share}>{money(mine?.share ?? 0)}</Text>
        </View>
        <View style={[s.between, { marginTop: 10 }]}>
          <Text style={st.label}>내가 결제한 금액</Text>
          <Text style={st.share}>{money(mine?.paid ?? 0)}</Text>
        </View>
      </View>
      <View style={[s.wrap, { marginBottom: 20 }]}>
        {["지출 내역", "정산 결과"].map((v) => (
          <Chip
            key={v}
            title={v}
            active={view === v}
            onPress={() => setView(v)}
          />
        ))}
      </View>
      <ErrorMessage message={error} />
      {view === "지출 내역" ? (
        <>
          <PartyFilter />
          <Section
            title={`지출 ${expenses.length}건`}
            action="지출 기록"
            onPress={() => router.push(editHref(trip.id, "expenses"))}
          />
          {expenses.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`${e.title} 수정`}
              onPress={() => router.push(editHref(trip.id, "expenses", e.id))}
              style={{ marginBottom: 12 }}
            >
              <Card>
                <View style={s.between}>
                  <View style={s.flex}>
                    <Text style={s.strong}>{e.title}</Text>
                    <Text style={[s.small, { marginTop: 6 }]}>
                      {e.date} · {user(e.payerId)?.name} 결제
                    </Text>
                  </View>
                  <Text style={st.expenseAmount}>{money(e.amount)}</Text>
                </View>
                <View style={s.between}>
                  <Badge>
                    {trip.parties.find((p) => p.id === e.partyId)?.name ??
                      "여행 공동 지출"}
                  </Badge>
                  <Text style={s.small}>
                    {Object.keys(e.shares).length}명 분담
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
          {!expenses.length && (
            <Empty
              title="기록된 지출이 없어요"
              description="결제한 사람과 비용을 나눌 멤버를 선택해 기록하세요."
              action="지출 기록하기"
              onPress={() => router.push(editHref(trip.id, "expenses"))}
            />
          )}
        </>
      ) : (
        <>
          <Section title="여행 전체 정산" />
          <Text style={[s.small, { marginBottom: 17 }]}>
            누가 누구에게 보내면 되는지 계산했어요. 완료 표시는 실제 송금 후
            직접 기록해 주세요.
          </Text>
          {totals.transfers.map((transfer) => (
            <View key={transfer.key} style={{ marginBottom: 12 }}>
              <Card>
                <View style={s.between}>
                  <Text style={s.strong}>
                    {user(transfer.from)?.name} → {user(transfer.to)?.name}
                  </Text>
                  <Text style={st.expenseAmount}>{money(transfer.amount)}</Text>
                </View>
                <Badge
                  color={
                    trip.confirmedTransfers.includes(transfer.key)
                      ? "#078A73"
                      : p.primary
                  }
                  background={
                    trip.confirmedTransfers.includes(transfer.key)
                      ? p.mintSoft
                      : p.blueSoft
                  }
                >
                  {trip.confirmedTransfers.includes(transfer.key)
                    ? "송금 완료 기록됨"
                    : "정산 대기"}
                </Badge>
                {[transfer.from, transfer.to].includes(session!.user.id) && (
                  <Button
                    title={
                      trip.confirmedTransfers.includes(transfer.key)
                        ? "완료 기록 취소"
                        : "송금 완료로 기록"
                    }
                    secondary
                    disabled={busy}
                    onPress={() => {
                      void execute({
                        type: "transfer.confirm",
                        tripId: trip.id,
                        transferKey: transfer.key,
                      }).catch((e) => setError(e.message));
                    }}
                  />
                )}
              </Card>
            </View>
          ))}
          {!totals.transfers.length && (
            <Empty
              title="정산할 금액이 없어요"
              description="현재 결제액과 부담액이 모두 맞아요."
            />
          )}
          <Section title="멤버별 부담 내역" />
          {Object.entries(totals.balances).map(([id, balance]) => (
            <View key={id} style={st.memberRow}>
              <Avatar user={user(id)} />
              <View style={s.flex}>
                <Text style={s.strong}>{user(id)?.name}</Text>
                <Text style={s.small}>
                  결제 {money(balance.paid)} · 부담 {money(balance.share)}
                </Text>
              </View>
            </View>
          ))}
          <Text style={[s.small, { marginTop: 20 }]}>
            지출이 추가·수정·삭제되면 정산 완료 기록은 초기화돼요. 원 단위
            잔액도 빠짐없이 나눕니다.
          </Text>
        </>
      )}
    </>
  );
}
const st = StyleSheet.create({
  summary: {
    backgroundColor: p.primary,
    padding: 23,
    borderRadius: 23,
    marginBottom: 22,
  },
  label: { color: "#DDEEFF", fontSize: 12 },
  amount: {
    color: p.white,
    fontSize: 35,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 13,
  },
  line: { height: 1, backgroundColor: "#FFFFFF38", marginVertical: 20 },
  share: { color: p.white, fontWeight: "700", fontSize: 14 },
  expenseAmount: { color: p.primary, fontSize: 16, fontWeight: "700" },
  memberRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: p.border,
  },
});
