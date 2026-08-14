import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, inventory, inventoryPhotos } from "@/server/db/schema";

/**
 * Phase 27-29: a photo upload's declared file.type/filename extension
 * proves nothing about its real bytes (trivially spoofable on any
 * multipart/form-data part) - uploadInventoryPhotos must reject content
 * that doesn't actually match a supported image format, the same
 * principle already applied to video uploads via ffprobe.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const uploadBufferMock = vi.fn(async (key: string) => `/media/${key}`);
vi.mock("@/server/storage", () => ({
  uploadBuffer: uploadBufferMock,
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { uploadInventoryPhotos } = await import("./inventory-actions");

let dealershipId: string;
let inventoryId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_photo_upload__",
      slug: `__test-photo-upload-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `photo-upload-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const owner = await localSignUp({ email: `photo-upload-owner-${suffix}@example.com`, password: "TestPassword123!" });
  await db.insert(dealershipUsers).values({ dealershipId, userId: owner.userId, role: "owner" });
  currentToken = signSessionToken(owner.userId);

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `PHOTO-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 4000000,
      status: "draft",
      source: "manual",
    })
    .returning({ id: inventory.id });
  inventoryId = rv.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

function fileWithBytes(name: string, type: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const REAL_JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];

describe("uploadInventoryPhotos", () => {
  it("stores a photo whose declared type matches its real magic bytes", async () => {
    const fd = new FormData();
    fd.set("photos", fileWithBytes("rv.jpg", "image/jpeg", REAL_JPEG_BYTES));

    const result = await uploadInventoryPhotos(dealershipId, inventoryId, fd);
    expect(result.ok).toBe(true);

    const rows = await db.select().from(inventoryPhotos).where(eq(inventoryPhotos.inventoryId, inventoryId));
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toMatch(/\.jpg$/);
  });

  it("rejects a file declaring image/jpeg whose actual bytes are not an image (spoofed Content-Type)", async () => {
    const htmlPolyglot = Buffer.from("<html><script>alert(document.cookie)</script></html>", "utf-8");
    const fd = new FormData();
    fd.set("photos", new File([htmlPolyglot], "totally-a-photo.jpg", { type: "image/jpeg" }));

    const before = await db.select().from(inventoryPhotos).where(eq(inventoryPhotos.inventoryId, inventoryId));

    const result = await uploadInventoryPhotos(dealershipId, inventoryId, fd);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/don't match a supported image format/);

    const after = await db.select().from(inventoryPhotos).where(eq(inventoryPhotos.inventoryId, inventoryId));
    expect(after).toHaveLength(before.length); // nothing was stored
  });
});
