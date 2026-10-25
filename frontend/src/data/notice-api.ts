import type { Notice } from "../domain/models";
import { TripApi } from "./trip-api";
import type { UserApi } from "./user-api";

export type NoticeInput = Pick<Notice, "title" | "body" | "pinned">;
export interface SharedNotice extends Notice {
  version: string;
  authorName: string;
  updatedAt: string;
}
export const noticeVersion = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(0|[1-9]\d{0,18})$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
const id = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9]\d{0,18}$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
function validate(item: SharedNotice) {
  if (
    !item ||
    !id(item.id) ||
    (item.authorId !== "" && !id(item.authorId)) ||
    typeof item.title !== "string" ||
    !item.title.trim() ||
    item.title.length > 100 ||
    typeof item.body !== "string" ||
    !item.body.trim() ||
    item.body.length > 3000 ||
    typeof item.pinned !== "boolean" ||
    !noticeVersion(item.version) ||
    typeof item.authorName !== "string" ||
    typeof item.createdAt !== "string" ||
    !Number.isFinite(Date.parse(item.createdAt)) ||
    typeof item.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(item.updatedAt))
  )
    throw new Error("공지 서버 응답 형식이 올바르지 않아요.");
  return item;
}
/** Reuses the authenticated API transport and cursor handling of the trip API. */
export class NoticeApi {
  constructor(
    private api: UserApi,
    private trips: TripApi,
  ) {}
  async list(tripId: string) {
    const items = await this.trips.all<SharedNotice>(
      `/trips/${tripId}/notices`,
    );
    const ids = new Set<string>();
    for (const item of items) {
      validate(item);
      if (ids.has(item.id)) throw new Error("공지 목록을 다시 불러와 주세요.");
      ids.add(item.id);
    }
    return items;
  }
  async create(tripId: string, input: NoticeInput, key: string) {
    return validate(
      await this.api.request<SharedNotice>(
        `/trips/${tripId}/notices`,
        "POST",
        input,
        { "Idempotency-Key": key },
      ),
    );
  }
  async update(
    tripId: string,
    noticeId: string,
    input: NoticeInput & { expectedVersion: string },
    key: string,
  ) {
    return validate(
      await this.api.request<SharedNotice>(
        `/trips/${tripId}/notices/${noticeId}`,
        "PUT",
        input,
        { "Idempotency-Key": key },
      ),
    );
  }
  remove(
    tripId: string,
    noticeId: string,
    expectedVersion: string,
    key: string,
  ) {
    return this.api.request(
      `/trips/${tripId}/notices/${noticeId}?expectedVersion=${encodeURIComponent(expectedVersion)}`,
      "DELETE",
      undefined,
      { "Idempotency-Key": key },
    );
  }
}
