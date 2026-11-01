interface GroupableMessage {
  authorId: string | null;
  createdAt: string;
}

export function sameChatMessageGroup(
  message: GroupableMessage | undefined,
  adjacent: GroupableMessage | undefined,
) {
  if (!message?.authorId || message.authorId !== adjacent?.authorId)
    return false;
  const date = new Date(message.createdAt);
  const adjacentDate = new Date(adjacent.createdAt);
  return (
    Number.isFinite(date.getTime()) &&
    Number.isFinite(adjacentDate.getTime()) &&
    date.toDateString() === adjacentDate.toDateString()
  );
}

export function showChatMessageTime(
  message: GroupableMessage,
  next: GroupableMessage | undefined,
) {
  if (!next || !sameChatMessageGroup(message, next)) return true;
  const gap = Date.parse(next.createdAt) - Date.parse(message.createdAt);
  return gap < 0 || gap >= 5 * 60 * 1000;
}
