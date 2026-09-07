export const members = ['지우', '민수', '서연', '도윤'];
export const parties = ['전체', '카페 파티', '바다 파티'] as const;
export type Party = typeof parties[number];
export type Schedule = { id: string; day: number; time: string; title: string; place: string; party: Party };
export type Expense = { id: string; title: string; amount: number; payer: string; participants: string[] };
export type Place = { id: string; name: string; category: string; address: string; note: string };
export type Trip = {
  id: string; name: string; region: string; dates: string[]; schedules: Schedule[];
  expenses: Expense[]; checklist: { id: string; title: string; done: boolean; owner: string }[];
  messages: { id: string; author: string; text: string; time: string }[];
  places: Place[]; notice: string;
};
let sequence = 0;
export const id = () => `${Date.now()}-${++sequence}`;
export const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
export const shortDate = (date: string) => date.slice(5).replace('-', '.');

export function dateRange(start: string, end: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end)) return [];
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days < 1 || days > 14) return [];
  return Array.from({ length: days }, (_, i) => new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10));
}

// Allocate indivisible won deterministically so all balances sum to zero.
export function settlement(expenses: Expense[]) {
  const balances = Object.fromEntries(members.map(m => [m, { paid: 0, share: 0, balance: 0 }]));
  for (const expense of expenses) {
    balances[expense.payer].paid += expense.amount;
    const base = Math.floor(expense.amount / expense.participants.length);
    const remainder = expense.amount % expense.participants.length;
    expense.participants.forEach((member, i) => { balances[member].share += base + (i < remainder ? 1 : 0); });
  }
  members.forEach(m => { balances[m].balance = balances[m].paid - balances[m].share; });
  const debtors = members.filter(m => balances[m].balance < 0).map(name => ({ name, amount: -balances[name].balance }));
  const creditors = members.filter(m => balances[m].balance > 0).map(name => ({ name, amount: balances[name].balance }));
  const transfers: { from: string; to: string; amount: number }[] = [];
  for (const debtor of debtors) for (const creditor of creditors) {
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) { transfers.push({ from: debtor.name, to: creditor.name, amount }); debtor.amount -= amount; creditor.amount -= amount; }
  }
  return { balances, transfers };
}

export function emptyTrip(name: string, region: string, dates: string[]): Trip {
  return { id: id(), name, region, dates, schedules: [], expenses: [], checklist: [], messages: [], places: [], notice: '우리 여행의 첫 공지를 작성해 보세요.' };
}

export function sampleTrip(): Trip {
  return {
    id: 'gangneung', name: '우리의 강릉 주말', region: '강릉', dates: ['2026-09-19', '2026-09-20'],
    schedules: [
      { id: 's1', day: 0, time: '09:30', title: '기차 타고, 바다로', place: '서울역 → 강릉역', party: '전체' },
      { id: 's2', day: 0, time: '12:00', title: '든든하게 점심 먹기', place: '초당동 순두부 식당', party: '전체' },
      { id: 's3', day: 0, time: '14:00', title: '커피 한 잔의 여유', place: '안목해변 카페', party: '카페 파티' },
      { id: 's4', day: 0, time: '14:00', title: '바닷길 따라 산책', place: '경포해변', party: '바다 파티' },
      { id: 's5', day: 0, time: '17:00', title: '숙소에서 다시 만나요', place: '강릉 스테이', party: '전체' },
      { id: 's6', day: 1, time: '10:00', title: '느긋한 아침 식사', place: '동네 브런치 카페', party: '전체' },
    ],
    expenses: [
      { id: 'e1', title: '바다 앞 숙소', amount: 240000, payer: '민수', participants: [...members] },
      { id: 'e2', title: '왕복 기차표', amount: 112000, payer: '지우', participants: [...members] },
      { id: 'e3', title: '간식 장보기', amount: 28000, payer: '서연', participants: [...members] },
    ],
    checklist: [
      { id: 'c1', title: '기차표 예약하기', owner: '지우', done: true },
      { id: 'c2', title: '보조 배터리 챙기기', owner: '각자', done: false },
      { id: 'c3', title: '저녁에 할 보드게임', owner: '민수', done: false },
      { id: 'c4', title: '숙소 체크인 시간 확인', owner: '서연', done: true },
    ],
    places: [
      { id: 'p1', name: '안목해변 카페', category: '카페', address: '강원 강릉시 창해로 일대', note: '바다가 보이는 창가 자리에 앉기' },
      { id: 'p2', name: '경포해변', category: '볼거리', address: '강원 강릉시 창해로 일대', note: '오후에 가볍게 산책하기' },
      { id: 'p3', name: '초당동 순두부 식당', category: '음식점', address: '강원 강릉시 초당동 일대', note: '점심 후보 · 방문 전 영업시간 확인' },
    ],
    notice: '토요일 오전 9시, 서울역에서 만나요! 기차는 9시 30분 출발이에요. 늦지 않게 와 주세요.',
    messages: [
      { id: 'm1', author: '민수', text: '드디어 다음 주다! 바다 너무 기대돼 🌊', time: '14:20' },
      { id: 'm2', author: '서연', text: '가보고 싶은 카페 저장해 뒀어. 다 같이 확인해 봐!', time: '14:22' },
      { id: 'm3', author: '지우', text: '좋아! 기차표도 예약 완료 🙌', time: '14:24' },
    ],
  };
}
