import type { UserApi } from "./user-api";
import { ApiError } from "./user-api";
import type {
  CheckItem,
  Coordinates,
  Expense,
  Party,
  ServerSettlement,
} from "../domain/models";
export interface PackingItem extends CheckItem {
  stateToken: string;
}
export interface PackingInput {
  title: string;
  ownerId: string | null;
}
export interface PackingCreation {
  items: PackingItem[];
}
const stateToken = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function assertPacking(condition: unknown): asserts condition {
  if (!condition) throw new Error("준비물 서버 응답 형식이 올바르지 않아요.");
}
function validatePacking(item: PackingItem) {
  assertPacking(
    item &&
      identifier(item.id) &&
      typeof item.title === "string" &&
      item.title.trim().length > 0 &&
      item.title.length <= 150 &&
      (item.ownerId === null || identifier(item.ownerId)) &&
      typeof item.done === "boolean" &&
      stateToken(item.stateToken),
  );
}
function compareIds(a: string, b: string) {
  return a.length - b.length || a.localeCompare(b);
}
export type ExpenseInput = Omit<Expense, "id">;
export interface ExpenseResult {
  expense: Expense;
  settlementRevision: string;
}
export interface ConfirmationInput {
  settlementRevision: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  completed: boolean;
  confirmationVersion: string;
}
const identifier = (value: unknown) =>
  typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const revision = (value: unknown) =>
  typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
const integerMoney = (value: unknown, signed = false) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  (signed || value >= 0);
function assertServer(condition: unknown): asserts condition {
  if (!condition)
    throw new Error("지출·정산 서버 응답 형식이 올바르지 않아요.");
}
function validateExpense(item: Expense) {
  assertServer(
    item &&
      identifier(item.id) &&
      identifier(item.payerId) &&
      typeof item.title === "string" &&
      integerMoney(item.amount) &&
      item.amount > 0 &&
      item.amount <= 1000000000 &&
      typeof item.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      typeof item.note === "string" &&
      (item.partyId === null || identifier(item.partyId)) &&
      item.shares &&
      !Array.isArray(item.shares) &&
      typeof item.shares === "object",
  );
  const shares = Object.entries(item.shares);
  assertServer(
    shares.length > 0 &&
      shares.every(([id, amount]) => identifier(id) && integerMoney(amount)),
  );
  assertServer(
    shares.reduce((sum, [, amount]) => sum + amount, 0) === item.amount,
  );
}
function validateSettlement(data: ServerSettlement) {
  assertServer(
    data && revision(data.settlementRevision) && integerMoney(data.total),
  );
  assertServer(
    data.balances &&
      typeof data.balances === "object" &&
      !Array.isArray(data.balances),
  );
  for (const [id, balance] of Object.entries(data.balances)) {
    assertServer(
      identifier(id) &&
        balance &&
        integerMoney(balance.paid) &&
        integerMoney(balance.share) &&
        integerMoney(balance.balance, true) &&
        balance.balance === balance.paid - balance.share,
    );
  }
  assertServer(Array.isArray(data.transfers));
  const keys = new Set<string>();
  for (const transfer of data.transfers) {
    assertServer(
      identifier(transfer.from) &&
        identifier(transfer.to) &&
        transfer.from !== transfer.to &&
        integerMoney(transfer.amount) &&
        transfer.amount > 0 &&
        typeof transfer.key === "string" &&
        transfer.key ===
          `${data.settlementRevision}:${transfer.from}:${transfer.to}:${transfer.amount}` &&
        typeof transfer.completed === "boolean" &&
        revision(transfer.confirmationVersion) &&
        !keys.has(transfer.key) &&
        transfer.from in data.balances &&
        transfer.to in data.balances,
    );
    keys.add(transfer.key);
  }
}
export interface SavedPlaceInput {
  name: string;
  address: string;
  category: string;
  note: string;
  coordinates: Coordinates | null;
}
export interface SavedPlaceDetail extends SavedPlaceInput {
  id: string;
}
export interface ItineraryInput {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  placeId: string | null;
  partyId: string | null;
  note: string;
}
export interface ItineraryItemDetail extends ItineraryInput {
  id: string;
  placeName: string;
  address: string;
}
export interface PublicUser {
  id: string;
  name: string;
}
export interface TripDetail {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: "ACTIVE" | "ARCHIVED";
  owner: PublicUser;
  memberCount: number;
  maxMembers: number;
  myRole: "OWNER" | "MEMBER";
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface Member {
  user: PublicUser;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
}
export interface FriendRequest {
  id: string;
  requester: PublicUser;
  recipient: PublicUser;
  status: string;
  createdAt: string;
}
export interface Invitation {
  id: string;
  trip: Pick<
    TripDetail,
    "id" | "title" | "destination" | "startDate" | "endDate"
  >;
  inviter: PublicUser;
  invitee: PublicUser;
  status: string;
  expiresAt: string;
}
export interface TripInput {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  inviteeIds: string[];
}
export interface Preview {
  trip: Invitation["trip"];
  memberCount: number;
  maxMembers: number;
  alreadyMember: boolean;
}
export class TripApi {
  constructor(private api: UserApi) {}
  async all<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page: { items: T[]; nextCursor: string | null } =
        await this.api.request(
          `${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
      items.push(...page.items);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor))
        throw new Error("목록을 불러오지 못했어요.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }
  lookup(email: string) {
    return this.api.request<{ user: PublicUser | null }>(
      "/users/lookup",
      "POST",
      { email },
    );
  }
  friends() {
    return this.all<{ user: PublicUser; friendsSince: string }>("/friends");
  }
  requests(direction: "received" | "sent", status = "PENDING") {
    return this.all<FriendRequest>(
      `/friend-requests?direction=${direction}&status=${status}`,
    );
  }
  requestFriend(recipientId: string) {
    return this.api.request<FriendRequest>("/friend-requests", "POST", {
      recipientId,
    });
  }
  decideFriend(id: string, action: "accept" | "decline" | "cancel") {
    return this.api.request(`/friend-requests/${id}/${action}`, "POST");
  }
  removeFriend(id: string) {
    return this.api.request(`/friends/${id}`, "DELETE");
  }
  trips() {
    return this.all<TripDetail>("/trips?status=ALL");
  }
  trip(id: string) {
    return this.api.request<TripDetail>(`/trips/${id}`);
  }
  members(id: string) {
    return this.all<Member>(`/trips/${id}/members`);
  }
  parties(tripId: string) {
    return this.all<Party>(`/trips/${tripId}/parties`);
  }
  createParty(tripId: string, input: Omit<Party, "id">, key: string) {
    return this.api.request<Party>(`/trips/${tripId}/parties`, "POST", input, {
      "Idempotency-Key": key,
    });
  }
  updateParty(tripId: string, partyId: string, input: Omit<Party, "id">) {
    return this.api.request<Party>(
      `/trips/${tripId}/parties/${partyId}`,
      "PUT",
      input,
    );
  }
  removeParty(tripId: string, partyId: string) {
    return this.api.request(`/trips/${tripId}/parties/${partyId}`, "DELETE");
  }
  savedPlaces(tripId: string) {
    return this.all<SavedPlaceDetail>(`/trips/${tripId}/saved-places`);
  }
  savedPlace(tripId: string, placeId: string) {
    return this.api.request<SavedPlaceDetail>(
      `/trips/${tripId}/saved-places/${placeId}`,
    );
  }
  createSavedPlace(tripId: string, input: SavedPlaceInput, key: string) {
    return this.api.request<SavedPlaceDetail>(
      `/trips/${tripId}/saved-places`,
      "POST",
      input,
      { "Idempotency-Key": key },
    );
  }
  updateSavedPlace(tripId: string, placeId: string, input: SavedPlaceInput) {
    return this.api.request<SavedPlaceDetail>(
      `/trips/${tripId}/saved-places/${placeId}`,
      "PUT",
      input,
    );
  }
  removeSavedPlace(tripId: string, placeId: string) {
    return this.api.request(
      `/trips/${tripId}/saved-places/${placeId}`,
      "DELETE",
    );
  }
  itineraryItems(tripId: string) {
    return this.all<ItineraryItemDetail>(`/trips/${tripId}/itinerary-items`);
  }
  async packingItems(tripId: string) {
    // A complete list is published only when every page belongs to the same snapshot.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const items: PackingItem[] = [];
        const seenCursors = new Set<string>();
        const seenIds = new Set<string>();
        let cursor: string | null = null;
        let checklistStateToken: string | undefined;
        let lastId: string | undefined;
        do {
          const page: {
            items: PackingItem[];
            nextCursor: string | null;
            checklistStateToken: string;
          } = await this.api.request(
            `/trips/${tripId}/packing-items?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          );
          assertPacking(
            page &&
              Array.isArray(page.items) &&
              stateToken(page.checklistStateToken) &&
              (page.nextCursor === null ||
                (typeof page.nextCursor === "string" &&
                  page.nextCursor.length > 0)),
          );
          if (
            checklistStateToken !== undefined &&
            checklistStateToken !== page.checklistStateToken
          )
            throw new ApiError(
              409,
              "PACKING_LIST_CHANGED",
              "준비물 목록이 변경됐어요.",
            );
          checklistStateToken = page.checklistStateToken;
          for (const item of page.items) {
            validatePacking(item);
            assertPacking(
              !seenIds.has(item.id) &&
                (!lastId || compareIds(lastId, item.id) < 0),
            );
            seenIds.add(item.id);
            lastId = item.id;
            items.push(item);
          }
          cursor = page.nextCursor;
          assertPacking(
            !cursor || (!seenCursors.has(cursor) && page.items.length > 0),
          );
          if (cursor) seenCursors.add(cursor);
        } while (cursor);
        items.sort(
          (a, b) => Number(a.done) - Number(b.done) || compareIds(a.id, b.id),
        );
        return { items, checklistStateToken: checklistStateToken! };
      } catch (error) {
        if (!(
          error instanceof ApiError && error.code === "PACKING_LIST_CHANGED"
        ))
          throw error;
      }
    }
    throw new Error(
      "다른 멤버가 준비물을 변경하고 있어요. 잠시 후 다시 불러와 주세요.",
    );
  }
  async packingItem(tripId: string, itemId: string) {
    const item = await this.api.request<PackingItem>(
      `/trips/${tripId}/packing-items/${itemId}`,
    );
    validatePacking(item);
    return item;
  }
  async createPackingItem(tripId: string, input: PackingInput, key: string) {
    const result = await this.api.request<PackingCreation>(
      `/trips/${tripId}/packing-items`,
      "POST",
      input,
      { "Idempotency-Key": key },
    );
    assertPacking(
      result && Array.isArray(result.items) && result.items.length > 0,
    );
    const ids = new Set<string>();
    const owners = new Set<string>();
    for (const item of result.items) {
      validatePacking(item);
      assertPacking(
        item.ownerId !== null && !ids.has(item.id) && !owners.has(item.ownerId),
      );
      ids.add(item.id);
      owners.add(item.ownerId);
    }
    if (input.ownerId !== null)
      assertPacking(
        result.items.length === 1 && result.items[0].ownerId === input.ownerId,
      );
    return result;
  }
  updatePackingItem(
    tripId: string,
    itemId: string,
    input: PackingInput & { expectedStateToken: string },
    key: string,
  ) {
    return this.api.request<PackingItem>(
      `/trips/${tripId}/packing-items/${itemId}`,
      "PUT",
      input,
      { "Idempotency-Key": key },
    );
  }
  completePackingItem(
    tripId: string,
    itemId: string,
    input: { done: boolean; expectedStateToken: string },
    key: string,
  ) {
    return this.api.request<PackingItem>(
      `/trips/${tripId}/packing-items/${itemId}/completion`,
      "PUT",
      input,
      { "Idempotency-Key": key },
    );
  }
  removePackingItem(
    tripId: string,
    itemId: string,
    expectedStateToken: string,
    key: string,
  ) {
    return this.api.request<{ deletedId: string }>(
      `/trips/${tripId}/packing-items/${itemId}?expectedStateToken=${encodeURIComponent(expectedStateToken)}`,
      "DELETE",
      undefined,
      { "Idempotency-Key": key },
    );
  }
  async expenses(tripId: string) {
    const items: Expense[] = [];
    const seenCursors = new Set<string>();
    const seenIds = new Set<string>();
    let cursor: string | null = null;
    let settlementRevision: string | undefined;
    do {
      const page: {
        items: Expense[];
        nextCursor: string | null;
        settlementRevision: string;
      } = await this.api.request(
        `/trips/${tripId}/expenses?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      assertServer(
        page &&
          Array.isArray(page.items) &&
          revision(page.settlementRevision) &&
          (page.nextCursor === null ||
            (typeof page.nextCursor === "string" &&
              page.nextCursor.length > 0)),
      );
      if (
        settlementRevision !== undefined &&
        settlementRevision !== page.settlementRevision
      )
        throw new ApiError(
          409,
          "SETTLEMENT_CHANGED",
          "지출이 변경됐어요. 다시 불러와 주세요.",
        );
      settlementRevision = page.settlementRevision;
      for (const item of page.items) {
        validateExpense(item);
        assertServer(!seenIds.has(item.id));
        seenIds.add(item.id);
        items.push(item);
      }
      cursor = page.nextCursor;
      assertServer(!cursor || !seenCursors.has(cursor));
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { items, settlementRevision: settlementRevision! };
  }
  async expense(tripId: string, expenseId: string) {
    const result = await this.api.request<ExpenseResult>(
      `/trips/${tripId}/expenses/${expenseId}`,
    );
    assertServer(revision(result.settlementRevision));
    validateExpense(result.expense);
    return result;
  }
  createExpense(tripId: string, input: ExpenseInput, key: string) {
    return this.api.request<ExpenseResult>(
      `/trips/${tripId}/expenses`,
      "POST",
      input,
      { "Idempotency-Key": key },
    );
  }
  updateExpense(
    tripId: string,
    expenseId: string,
    input: ExpenseInput & { settlementRevision: string },
    key: string,
  ) {
    return this.api.request<ExpenseResult>(
      `/trips/${tripId}/expenses/${expenseId}`,
      "PUT",
      input,
      { "Idempotency-Key": key },
    );
  }
  removeExpense(
    tripId: string,
    expenseId: string,
    settlementRevision: string,
    key: string,
  ) {
    return this.api.request<{ settlementRevision: string }>(
      `/trips/${tripId}/expenses/${expenseId}?settlementRevision=${encodeURIComponent(settlementRevision)}`,
      "DELETE",
      undefined,
      { "Idempotency-Key": key },
    );
  }
  async settlement(tripId: string) {
    const result = await this.api.request<ServerSettlement>(
      `/trips/${tripId}/settlement`,
    );
    validateSettlement(result);
    return result;
  }
  confirmTransfer(tripId: string, input: ConfirmationInput, key: string) {
    return this.api.request<{
      settlementRevision: string;
      completed: boolean;
      confirmationVersion: string;
    }>(`/trips/${tripId}/settlement/confirmations`, "PUT", input, {
      "Idempotency-Key": key,
    });
  }
  itineraryItem(tripId: string, itemId: string) {
    return this.api.request<ItineraryItemDetail>(
      `/trips/${tripId}/itinerary-items/${itemId}`,
    );
  }
  createItineraryItem(tripId: string, input: ItineraryInput, key: string) {
    return this.api.request<ItineraryItemDetail>(
      `/trips/${tripId}/itinerary-items`,
      "POST",
      input,
      { "Idempotency-Key": key },
    );
  }
  updateItineraryItem(tripId: string, itemId: string, input: ItineraryInput) {
    return this.api.request<ItineraryItemDetail>(
      `/trips/${tripId}/itinerary-items/${itemId}`,
      "PUT",
      input,
    );
  }
  removeItineraryItem(tripId: string, itemId: string) {
    return this.api.request(
      `/trips/${tripId}/itinerary-items/${itemId}`,
      "DELETE",
    );
  }
  create(input: TripInput, key: string) {
    return this.api.request<{ trip: TripDetail; invitations: unknown[] }>(
      "/trips",
      "POST",
      input,
      { "Idempotency-Key": key },
    );
  }
  update(
    id: string,
    input: Partial<Omit<TripInput, "inviteeIds">> & {
      version: number;
      status?: "ACTIVE" | "ARCHIVED";
    },
  ) {
    return this.api.request<TripDetail>(`/trips/${id}`, "PATCH", input);
  }
  invite(id: string, inviteeId: string) {
    return this.api.request<Invitation>(`/trips/${id}/invitations`, "POST", {
      inviteeId,
    });
  }
  invitations(tripId?: string, status = "PENDING") {
    return this.all<Invitation>(
      `${tripId ? `/trips/${tripId}/invitations` : "/users/me/trip-invitations"}?status=${status}`,
    );
  }
  decideInvitation(id: string, action: "accept" | "decline" | "cancel") {
    return this.api.request<{ tripId?: string }>(
      `/trip-invitations/${id}/${action}`,
      "POST",
    );
  }
  issueCode(id: string) {
    return this.api.request<{ code: string; expiresAt: string }>(
      `/trips/${id}/invite-code`,
      "POST",
    );
  }
  revokeCode(id: string) {
    return this.api.request(`/trips/${id}/invite-code`, "DELETE");
  }
  preview(code: string) {
    return this.api.request<Preview>("/trip-join/preview", "POST", { code });
  }
  join(code: string) {
    return this.api.request<{ tripId: string }>("/trip-join", "POST", { code });
  }
}
// This UUID is a retry identifier, not an invitation or authentication secret.
export function requestKey() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 3) | 8).toString(16);
  });
}
