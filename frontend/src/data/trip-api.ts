import type { UserApi } from "./user-api";
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
