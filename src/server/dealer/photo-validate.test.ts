import { describe, expect, it } from "vitest";

import { extensionForImageType, sniffImageType } from "./photo-validate";

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP_HEADER = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]), // file size, irrelevant to detection
  Buffer.from("WEBP", "ascii"),
]);

describe("sniffImageType", () => {
  it("identifies a real JPEG by its magic bytes", () => {
    expect(sniffImageType(JPEG_HEADER)).toBe("image/jpeg");
  });

  it("identifies a real PNG by its magic bytes", () => {
    expect(sniffImageType(PNG_HEADER)).toBe("image/png");
  });

  it("identifies a real WebP by its RIFF/WEBP markers", () => {
    expect(sniffImageType(WEBP_HEADER)).toBe("image/webp");
  });

  it("rejects a file whose declared type doesn't match its actual bytes", () => {
    // An HTML file (e.g. a stored-XSS attempt) renamed/declared as a photo -
    // the whole point of this function is that a spoofed Content-Type or
    // filename extension never gets this far.
    const disguised = Buffer.from("<html><script>alert(1)</script></html>", "utf-8");
    expect(sniffImageType(disguised)).toBeNull();
  });

  it("rejects an empty or truncated buffer", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull(); // JPEG header cut short
  });
});

describe("extensionForImageType", () => {
  it("maps each sniffed type to its real extension", () => {
    expect(extensionForImageType("image/jpeg")).toBe("jpg");
    expect(extensionForImageType("image/png")).toBe("png");
    expect(extensionForImageType("image/webp")).toBe("webp");
  });
});
