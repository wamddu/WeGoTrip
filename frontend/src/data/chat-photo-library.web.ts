import * as ImagePicker from "expo-image-picker";
import type { ChatPhoto } from "./chat-photo-batch";
export { uploadPhoto } from "./chat-photo-upload.web";

export const PHOTO_PAGE_SIZE = 60;
export async function photoPermission(_request = false) {
  return { granted: true, canAskAgain: true, accessPrivileges: "all" as const };
}
export async function listPhotos(_offset: number): Promise<ChatPhoto[]> {
  return [];
}
export async function managePhotoAccess() {}
export const watchPhotos = (_reload: () => void) => ({ remove() {} });

// Browsers require an explicit file chooser; they cannot enumerate a device's photo library.
export async function importPhotos(): Promise<ChatPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: 0,
  });
  return result.canceled
    ? []
    : result.assets.map((asset) => ({
        ...asset,
        id: asset.uri,
        filename: asset.fileName,
      }));
}
