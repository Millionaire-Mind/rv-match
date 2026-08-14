/**
 * Inspects the actual bytes of an uploaded photo rather than trusting the
 * browser-supplied `File.type` (trivially spoofable - any client can set
 * an arbitrary Content-Type on a multipart form part regardless of the
 * real file contents). Mirrors the same principle
 * src/server/video/validate.ts already applies to video uploads via
 * ffprobe, just via a lightweight magic-byte check instead of a
 * full-format decode (images don't need a decode to prove their type -
 * the container signature is enough).
 */
export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const EXTENSION_BY_TYPE: Record<SniffedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForImageType(type: SniffedImageType): string {
  return EXTENSION_BY_TYPE[type];
}
