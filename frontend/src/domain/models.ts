export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}
export interface Party {
  id: string;
  name: string;
  memberIds: string[];
  date: string;
  startTime: string;
  endTime: string;
}
export interface Place {
  id: string;
  name: string;
  category: string;
  address: string;
  note: string;
}
export interface Agenda {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  placeId: string | null;
  partyId: string | null;
  note: string;
}
export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  payerId: string;
  shares: Record<string, number>;
  partyId: string | null;
  note: string;
}
export interface CheckItem {
  id: string;
  title: string;
  ownerId: string | null;
  done: boolean;
}
export interface Notice {
  id: string;
  title: string;
  body: string;
  authorId: string;
  pinned: boolean;
  createdAt: string;
}
export interface Message {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
}
export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  ownerId: string;
  memberIds: string[];
  inviteCode: string;
  archived: boolean;
  parties: Party[];
  places: Place[];
  agenda: Agenda[];
  expenses: Expense[];
  checklist: CheckItem[];
  notices: Notice[];
  messages: Message[];
  confirmedTransfers: string[];
}
export interface Notification {
  id: string;
  userId: string;
  tripId: string;
  title: string;
  body: string;
  section: string;
  read: boolean;
  createdAt: string;
}
export interface Workspace {
  version: 1;
  users: User[];
  trips: Trip[];
  friendships: Record<string, string[]>;
  notifications: Notification[];
}
export interface TripInput {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  memberIds: string[];
}
export interface Entities {
  parties: Party;
  places: Place;
  agenda: Agenda;
  expenses: Expense;
  checklist: CheckItem;
  notices: Notice;
  messages: Message;
}
export type Collection = keyof Entities;
export type SaveCommand = {
  [K in Collection]: {
    type: "item.save";
    tripId: string;
    collection: K;
    item: Entities[K];
  };
}[Collection];
export type Command =
  | SaveCommand
  | {
      type: "item.delete";
      tripId: string;
      collection: Collection;
      itemId: string;
    }
  | { type: "trip.create"; input: TripInput }
  | {
      type: "trip.update";
      tripId: string;
      input: Omit<TripInput, "memberIds"> & { archived: boolean };
    }
  | { type: "trip.invite"; tripId: string; userId: string }
  | { type: "trip.join"; code: string }
  | { type: "friend.add"; userId: string }
  | { type: "notification.read"; notificationId: string }
  | { type: "transfer.confirm"; tripId: string; transferKey: string };
export interface Session {
  user: User;
  token: string;
}
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
export const shortDate = (date: string) => date.slice(5).replace("-", ".");
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function datesBetween(start: string, end: string): string[] {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(start) || !valid(end)) return [];
  const count = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (count < 1 || count > 90) return [];
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}
export function equalShares(amount: number, ids: string[]) {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    !Number.isSafeInteger(amount) ||
    amount < 1
  )
    throw new Error("올바른 금액과 부담 멤버를 선택해 주세요.");
  return Object.fromEntries(
    ids.map((id, i) => [
      id,
      Math.floor(amount / ids.length) + (i < amount % ids.length ? 1 : 0),
    ]),
  );
}
export function calculateSettlement(
  trip: Pick<Trip, "memberIds" | "expenses">,
) {
  const ids = [
    ...new Set([
      ...trip.memberIds,
      ...trip.expenses.flatMap((e) => [e.payerId, ...Object.keys(e.shares)]),
    ]),
  ];
  const balances = Object.fromEntries(
    ids.map((id) => [id, { paid: 0, share: 0, balance: 0 }]),
  );
  for (const e of trip.expenses) {
    balances[e.payerId].paid += e.amount;
    Object.entries(e.shares).forEach(([id, amount]) => {
      balances[id].share += amount;
    });
  }
  ids.forEach((id) => {
    balances[id].balance = balances[id].paid - balances[id].share;
  });
  const debtors = ids
    .filter((id) => balances[id].balance < 0)
    .map((id) => ({ id, amount: -balances[id].balance }));
  const creditors = ids
    .filter((id) => balances[id].balance > 0)
    .map((id) => ({ id, amount: balances[id].balance }));
  const transfers: { from: string; to: string; amount: number; key: string }[] =
    [];
  for (const from of debtors)
    for (const to of creditors) {
      const amount = Math.min(from.amount, to.amount);
      if (amount > 0) {
        transfers.push({
          from: from.id,
          to: to.id,
          amount,
          key: `${from.id}:${to.id}:${amount}`,
        });
        from.amount -= amount;
        to.amount -= amount;
      }
    }
  return {
    balances,
    transfers,
    total: trip.expenses.reduce((sum, e) => sum + e.amount, 0),
  };
}
