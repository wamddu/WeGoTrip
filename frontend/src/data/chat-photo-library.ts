import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
  presentPermissionsPicker,
  addListener,
} from "expo-media-library";
import { File as LocalFile } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ChatPhoto } from "./chat-photo-batch";
import type { ChatApi } from "./chat-api";

export const PHOTO_PAGE_SIZE = 60;
const MAX_BYTES = 8 * 1024 * 1024;
const supported: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function photoPermission(request = false) {
  let permission = await getPermissionsAsync(false, ["photo"]);
  if (request && !permission.granted && permission.canAskAgain)
    permission = await requestPermissionsAsync(false, ["photo"]);
  return permission;
}

export async function listPhotos(offset: number): Promise<ChatPhoto[]> {
  const assets = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(PHOTO_PAGE_SIZE)
    .offset(offset)
    .exeForMetadata();
  // ph:// and content:// sources let expo-image load thumbnails without exporting originals.
  return assets.map((asset) => ({ ...asset, uri: asset.id }));
}

export const managePhotoAccess = () => presentPermissionsPicker(["photo"]);
export const watchPhotos = (reload: () => void) => addListener(reload);

export async function importPhotos(): Promise<ChatPhoto[]> {
  return [];
}

export async function uploadPhoto(
  photo: ChatPhoto,
  api: Pick<ChatApi, "upload">,
) {
  let temporary: LocalFile | undefined;
  try {
    // Resolve only selected originals, including photos stored in iCloud.
    let uri = await new Asset(photo.id).getUri();
    let filename = photo.filename ?? "photo";
    let mime = supported[filename.split(".").pop()?.toLowerCase() ?? ""];
    if (mime === "image/gif" && new LocalFile(uri).size > MAX_BYTES)
      throw new Error("GIF 사진은 8MB 이하로 선택해 주세요.");
    if (!mime || new LocalFile(uri).size > MAX_BYTES) {
      const context = ImageManipulator.manipulate(uri);
      let rendered;
      try {
        if (
          photo.width &&
          photo.height &&
          Math.max(photo.width, photo.height) > 2560
        )
          context.resize(
            photo.width > photo.height ? { width: 2560 } : { height: 2560 },
          );
        rendered = await context.renderAsync();
        const converted = await rendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.85,
        });
        uri = converted.uri;
        temporary = new LocalFile(uri);
        filename = "photo.jpg";
        mime = "image/jpeg";
      } finally {
        rendered?.release();
        context.release();
      }
    }
    if (new LocalFile(uri).size > MAX_BYTES)
      throw new Error(
        "이 사진은 용량이 커요. 8MB 이하의 사진을 선택해 주세요.",
      );
    const form = new FormData();
    form.append("file", { uri, name: filename, type: mime } as unknown as Blob);
    return await api.upload(form);
  } finally {
    try {
      if (temporary?.exists) temporary.delete();
    } catch {
      // A cache cleanup failure must not turn a successful upload into a retry.
    }
  }
}
