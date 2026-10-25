export interface ChatPush {
  type: "CHAT_MESSAGE";
  recipientId: string;
  tripId: string;
  partyId: string;
  messageId: string;
  eventId: string;
  deliveryId: string;
}
export interface NoticePush {
  type: "TRIP_NOTICE";
  recipientId: string;
  tripId: string;
  noticeId: string;
  eventId: string;
  deliveryId: string;
}
export type AppPush = ChatPush | NoticePush;
const id = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9]\d{0,18}$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;

export function parseChatPush(raw: unknown): ChatPush | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (
    data.type !== "CHAT_MESSAGE" ||
    !id(data.recipientId) ||
    !id(data.tripId) ||
    !id(data.messageId) ||
    !id(data.eventId) ||
    !id(data.deliveryId) ||
    (data.partyId !== "" && !id(data.partyId))
  )
    return null;
  return {
    type: "CHAT_MESSAGE",
    recipientId: data.recipientId,
    tripId: data.tripId,
    partyId: data.partyId as string,
    messageId: data.messageId,
    eventId: data.eventId,
    deliveryId: data.deliveryId,
  };
}

export function chatPushHref(push: ChatPush) {
  return {
    pathname: "/trip/[tripId]/[section]" as const,
    params: {
      tripId: push.tripId,
      section: "chat",
      chatPartyId: push.partyId,
      pushId: push.deliveryId,
    },
  };
}

export class SeenPushes {
  private keys = new Set<string>();
  accept(stage: "display" | "open", push: AppPush) {
    const key = `${stage}:${push.recipientId}:${push.deliveryId}`;
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    if (this.keys.size > 500)
      this.keys.delete(this.keys.values().next().value!);
    return true;
  }
}

export function parsePush(raw: unknown): AppPush | null {
  const chat = parseChatPush(raw);
  if (chat) return chat;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (
    data.type !== "TRIP_NOTICE" ||
    !id(data.recipientId) ||
    !id(data.tripId) ||
    !id(data.noticeId) ||
    !id(data.eventId) ||
    !id(data.deliveryId)
  )
    return null;
  return {
    type: "TRIP_NOTICE",
    recipientId: data.recipientId,
    tripId: data.tripId,
    noticeId: data.noticeId,
    eventId: data.eventId,
    deliveryId: data.deliveryId,
  };
}
export function pushHref(push: AppPush) {
  return push.type === "CHAT_MESSAGE"
    ? chatPushHref(push)
    : {
        pathname: "/trip/[tripId]/[section]" as const,
        params: {
          tripId: push.tripId,
          section: "notices",
          noticeId: push.noticeId,
          pushId: push.deliveryId,
        },
      };
}
export function pushText(raw: unknown) {
  return parsePush(raw)?.type === "TRIP_NOTICE"
    ? { title: "새 여행 공지", body: "참여 중인 여행에 새 공지가 등록됐어요." }
    : {
        title: "새 채팅 메시지",
        body: "참여 중인 여행 채팅에 새 메시지가 도착했어요.",
      };
}

export interface PushHandlers {
  foreground(data: unknown): boolean;
  open(data: unknown): void;
}
