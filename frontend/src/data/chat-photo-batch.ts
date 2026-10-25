export interface ChatPhoto {
  id: string;
  uri: string;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  file?: File;
}

export interface PhotoAttachment {
  photo: ChatPhoto;
  uploadId?: string;
  sent?: boolean;
}

/** Keep acknowledged uploads when a message request fails, so retries reuse its idempotency key. */
export async function sendPhotoAttachments(
  attachments: PhotoAttachment[],
  actions: {
    upload(photo: ChatPhoto): Promise<{ id: string }>;
    send(uploadId: string): Promise<unknown>;
    active(): boolean;
    onSent(attachment: PhotoAttachment): void;
  },
) {
  for (const attachment of attachments) {
    if (attachment.sent) continue;
    if (!actions.active()) return false;
    attachment.uploadId ??= (await actions.upload(attachment.photo)).id;
    if (!actions.active()) return false;
    await actions.send(attachment.uploadId);
    attachment.sent = true;
    actions.onSent(attachment);
  }
  return true;
}
