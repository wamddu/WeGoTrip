import { UserApi } from "./user-api";

export interface PollOption {
  id: string;
  label: string;
  placeId: string | null;
  placeName: string;
  placeAddress: string;
  votes: number;
}
export interface ChatPoll {
  id: string;
  question: string;
  closed: boolean;
  closesAt: string | null;
  serverNow: string;
  myOptionId: string | null;
  myOptionIds: string[];
  allowMultiple: boolean;
  participantCount: number;
  options: PollOption[];
}
export interface ChatMessage {
  id: string;
  kind: "TEXT" | "IMAGE" | "POLL";
  text: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  revision: string;
  imageUrl: string | null;
  poll: ChatPoll | null;
}
export interface PollInput {
  question: string;
  closesAt?: string | null;
  allowMultiple?: boolean;
  options: { label: string; placeId: string | null }[];
}
export interface ChatPage {
  items: ChatMessage[];
  nextCursor: string | null;
}
export const compareDecimalIds = (a: string, b: string) =>
  a.length - b.length || a.localeCompare(b);
// Socket fetches, history and write responses can arrive out of order.
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    const previous = map.get(message.id);
    if (
      previous?.revision === message.revision &&
      previous.poll?.serverNow &&
      message.poll?.serverNow &&
      Date.parse(previous.poll.serverNow) > Date.parse(message.poll.serverNow)
    )
      continue;
    if (
      !previous ||
      compareDecimalIds(previous.revision, message.revision) <= 0
    )
      map.set(message.id, message);
  }
  return [...map.values()].sort((a, b) => compareDecimalIds(a.id, b.id));
}
/** Fill every page between the last synchronized message and the latest page. */
export async function loadChatUpdates(
  api: Pick<ChatApi, "history">,
  knownHead: string | null,
  active: () => boolean = () => true,
): Promise<ChatPage> {
  let page = await api.history();
  let items = page.items;
  const seen = new Set<string>();
  while (
    knownHead !== null &&
    page.nextCursor &&
    active() &&
    items.length > 0 &&
    compareDecimalIds(items[0].id, knownHead) > 0
  ) {
    if (seen.has(page.nextCursor))
      throw new Error("대화 목록을 불러오지 못했어요.");
    seen.add(page.nextCursor);
    page = await api.history(page.nextCursor);
    if (!page.items.length && page.nextCursor)
      throw new Error("대화 목록 응답이 올바르지 않아요.");
    items = mergeMessages(items, page.items);
  }
  return { items, nextCursor: page.nextCursor };
}
export class ChatApi {
  constructor(
    private api: UserApi,
    private tripId: string,
    private partyId: string | null,
    private imagesOnly = false,
  ) {}
  private path(resource: string) {
    return `/trips/${encodeURIComponent(this.tripId)}/chat/${resource}${this.partyId ? `?partyId=${encodeURIComponent(this.partyId)}` : ""}`;
  }
  history(before?: string) {
    const path = this.path("messages");
    const params = [
      ...(this.imagesOnly ? ["imagesOnly=true"] : []),
      ...(before ? [`before=${encodeURIComponent(before)}`] : []),
    ];
    return this.api.request<ChatPage>(
      `${path}${params.length ? `${path.includes("?") ? "&" : "?"}${params.join("&")}` : ""}`,
    );
  }
  message(id: string) {
    return this.api.request<ChatMessage>(
      this.path(`messages/${encodeURIComponent(id)}`),
    );
  }
  send(text: string, uploadId: string | null, key: string) {
    return this.api.request<ChatMessage>(
      this.path("messages"),
      "POST",
      { text, uploadId },
      { "Idempotency-Key": key },
    );
  }
  poll(input: PollInput, key: string) {
    return this.api.request<ChatMessage>(this.path("polls"), "POST", input, {
      "Idempotency-Key": key,
    });
  }
  vote(id: string, optionId: string | null, selected?: boolean) {
    return this.api.request<ChatMessage>(
      this.path(`polls/${encodeURIComponent(id)}/vote`),
      "PUT",
      { optionId, ...(selected === undefined ? {} : { selected }) },
    );
  }
  close(id: string) {
    return this.api.request<ChatMessage>(
      this.path(`polls/${encodeURIComponent(id)}/closure`),
      "PUT",
      { closed: true },
    );
  }
  upload(file: FormData) {
    return this.api.request<{ id: string; url: string }>(
      this.path("images"),
      "POST",
      file,
    );
  }
}
