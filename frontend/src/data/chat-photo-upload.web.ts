import type { ChatApi } from "./chat-api";
import type { ChatPhoto } from "./chat-photo-batch";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2560;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const compressionError = () =>
  new Error("사진을 압축하지 못했어요. 다른 사진으로 다시 시도해 주세요.");

type DecodedPhoto = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
};

async function decode(file: Blob): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some browsers decode a format through <img> but not createImageBitmap.
    }
  }
  if (typeof Image !== "function") throw compressionError();
  const image = new Image();
  const uri = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(compressionError());
      image.src = uri;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close() {
        image.onload = null;
        image.onerror = null;
        image.src = "";
        URL.revokeObjectURL(uri);
      },
    };
  } catch {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(uri);
    throw compressionError();
  }
}

// Re-encoding an animation on a canvas would silently keep only its first frame.
async function animated(file: Blob) {
  if (file.type === "image/gif") return true;
  if (file.type === "image/webp") {
    const header = new Uint8Array(await file.slice(0, 21).arrayBuffer());
    return (
      header.length === 21 &&
      String.fromCharCode(...header.slice(12, 16)) === "VP8X" &&
      (header[20] & 2) !== 0
    );
  }
  if (file.type === "image/png") {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (signature.join(",") !== "137,80,78,71,13,10,26,10")
      throw compressionError();
    let offset = 8;
    for (let chunks = 0; chunks < 128 && offset + 12 <= file.size; chunks++) {
      const header = new DataView(
        await file.slice(offset, offset + 8).arrayBuffer(),
      );
      const type = String.fromCharCode(...new Uint8Array(header.buffer, 4, 4));
      const length = header.getUint32(0);
      if (!/^[a-zA-Z]{4}$/.test(type) || length > file.size - offset - 12)
        throw compressionError();
      if (type === "acTL") return true;
      if (type === "IDAT" || type === "IEND") return false;
      offset += length + 12;
    }
    throw compressionError();
  }
  return false;
}

async function compress(file: Blob): Promise<Blob> {
  if (await animated(file))
    throw new Error(
      "움직이는 이미지는 원본으로 전송해요. 8MB 이하의 파일을 선택해 주세요.",
    );
  let decoded: DecodedPhoto | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    decoded = await decode(file);
    if (
      ![decoded.width, decoded.height].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    )
      throw compressionError();
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw compressionError();
    let scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
    // WebP preserves PNG/WebP transparency. Unsupported encoders return PNG.
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const result = await new Promise<Blob>((resolve, reject) => {
          canvas!.toBlob(
            (blob) => (blob?.size ? resolve(blob) : reject(compressionError())),
            type,
            quality,
          );
        });
        if (!["image/jpeg", "image/png", "image/webp"].includes(result.type))
          throw compressionError();
        if (result.size <= MAX_BYTES) return result;
        // PNG is lossless: reducing the quality argument cannot reduce its size.
        if (result.type === "image/png") break;
      }
      scale *= 0.75;
    }
    throw new Error(
      "사진을 충분히 줄이지 못했어요. 더 작은 사진으로 다시 시도해 주세요.",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("사진을"))
      throw error;
    throw compressionError();
  } finally {
    decoded?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/** Compress only oversized still images; preview blobs and small originals stay intact. */
export async function uploadPhoto(
  photo: ChatPhoto,
  api: Pick<ChatApi, "upload">,
) {
  let file: Blob;
  if (photo.file) file = photo.file;
  else {
    const response = await fetch(photo.uri);
    if (!response.ok)
      throw new Error("사진을 읽지 못했어요. 다시 선택해 주세요.");
    file = await response.blob();
  }
  if (!Object.hasOwn(extensions, file.type))
    throw new Error("JPG, PNG, WebP, GIF 사진을 선택해 주세요.");
  if (!file.size) throw new Error("비어 있는 사진은 전송할 수 없어요.");
  let filename = photo.filename || `photo.${extensions[file.type]}`;
  if (file.size > MAX_BYTES) {
    file = await compress(file);
    const stem = filename.replace(/\.[^.]+$/, "") || "photo";
    filename = `${stem}.${extensions[file.type]}`;
  }
  const form = new FormData();
  form.append("file", file, filename);
  return api.upload(form);
}
