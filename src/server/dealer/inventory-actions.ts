"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  inventory,
  inventoryFeatures,
  inventoryPhotos,
  inventoryPriceHistory,
  inventoryVideos,
  videoGenerationJobs,
} from "@/server/db/schema";
import {
  requireDealerRole,
  requireInventoryInDealership,
  requireVideoBelongsToInventory,
  requireVideoJobInDealership,
} from "@/server/auth/guards";
import { inventoryFormSchema } from "@/server/validation/inventory";
import { uploadBuffer } from "@/server/storage";
import { logAudit } from "@/server/audit/log";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300MB
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export type InventoryFormState = { ok: false; error: string } | { ok: true; inventoryId: string };

function parseInventoryForm(formData: FormData) {
  return inventoryFormSchema.safeParse({
    stockNumber: formData.get("stockNumber"),
    vin: formData.get("vin") || undefined,
    year: formData.get("year"),
    make: formData.get("make"),
    model: formData.get("model"),
    floorplan: formData.get("floorplan") || undefined,
    rvType: formData.get("rvType"),
    condition: formData.get("condition"),
    msrp: formData.get("msrp") || undefined,
    salePrice: formData.get("salePrice"),
    advertisedPrice: formData.get("advertisedPrice") || undefined,
    lengthFeet: formData.get("lengthFeet") || undefined,
    dryWeightLbs: formData.get("dryWeightLbs") || undefined,
    gvwrLbs: formData.get("gvwrLbs") || undefined,
    sleeps: formData.get("sleeps") || undefined,
    slideCount: formData.get("slideCount") || undefined,
    bunkhouse: formData.get("bunkhouse") === "on",
    toyHauler: formData.get("toyHauler") === "on",
    outdoorKitchen: formData.get("outdoorKitchen") === "on",
    exteriorColor: formData.get("exteriorColor") || undefined,
    description: formData.get("description") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    zipCode: formData.get("zipCode") || undefined,
    features: formData.get("features") || undefined,
  });
}

export async function createInventory(
  dealershipId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  await requireDealerRole(dealershipId);
  const parsed = parseInventoryForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;

  if (await stockNumberTaken(dealershipId, d.stockNumber)) {
    return { ok: false, error: `Stock number ${d.stockNumber} is already in use.` };
  }

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: d.stockNumber,
      vin: d.vin,
      year: d.year,
      make: d.make,
      model: d.model,
      floorplan: d.floorplan,
      rvType: d.rvType,
      condition: d.condition,
      msrpCents: d.msrp ? Math.round(d.msrp * 100) : null,
      salePriceCents: Math.round(d.salePrice * 100),
      advertisedPriceCents: d.advertisedPrice ? Math.round(d.advertisedPrice * 100) : null,
      lengthInches: d.lengthFeet ? Math.round(d.lengthFeet * 12) : null,
      dryWeightLbs: d.dryWeightLbs ? Math.round(d.dryWeightLbs) : null,
      gvwrLbs: d.gvwrLbs ? Math.round(d.gvwrLbs) : null,
      sleeps: d.sleeps,
      slideCount: d.slideCount ?? 0,
      bunkhouse: d.bunkhouse,
      toyHauler: d.toyHauler,
      outdoorKitchen: d.outdoorKitchen,
      exteriorColor: d.exteriorColor,
      description: d.description,
      city: d.city,
      state: d.state,
      zipCode: d.zipCode,
      status: "draft",
      source: "manual",
    })
    .returning({ id: inventory.id });

  await setFeatures(rv.id, d.features);
  await logAudit({ action: "inventory.create", entityType: "inventory", entityId: rv.id, dealershipId });
  revalidatePath("/dealer/inventory");
  return { ok: true, inventoryId: rv.id };
}

async function stockNumberTaken(dealershipId: string, stockNumber: string): Promise<boolean> {
  const rows = await db
    .select({ id: inventory.id, dealershipId: inventory.dealershipId })
    .from(inventory)
    .where(eq(inventory.stockNumber, stockNumber));
  return rows.some((r) => r.dealershipId === dealershipId);
}

async function setFeatures(inventoryId: string, featuresCsv: string | undefined) {
  await db.delete(inventoryFeatures).where(eq(inventoryFeatures.inventoryId, inventoryId));
  const features = (featuresCsv ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (features.length) {
    await db.insert(inventoryFeatures).values(features.map((feature) => ({ inventoryId, feature })));
  }
}

export async function updateInventory(
  dealershipId: string,
  inventoryId: string,
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  await requireDealerRole(dealershipId);
  const parsed = parseInventoryForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;

  const [current] = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, inventoryId))
    .limit(1);
  if (!current || current.dealershipId !== dealershipId) {
    return { ok: false, error: "RV not found." };
  }

  const newSalePriceCents = Math.round(d.salePrice * 100);
  if (newSalePriceCents !== current.salePriceCents) {
    await db.insert(inventoryPriceHistory).values({
      inventoryId,
      oldPriceCents: current.salePriceCents,
      newPriceCents: newSalePriceCents,
    });
  }

  await db
    .update(inventory)
    .set({
      stockNumber: d.stockNumber,
      vin: d.vin,
      year: d.year,
      make: d.make,
      model: d.model,
      floorplan: d.floorplan,
      rvType: d.rvType,
      condition: d.condition,
      msrpCents: d.msrp ? Math.round(d.msrp * 100) : null,
      salePriceCents: newSalePriceCents,
      advertisedPriceCents: d.advertisedPrice ? Math.round(d.advertisedPrice * 100) : null,
      lengthInches: d.lengthFeet ? Math.round(d.lengthFeet * 12) : null,
      dryWeightLbs: d.dryWeightLbs ? Math.round(d.dryWeightLbs) : null,
      gvwrLbs: d.gvwrLbs ? Math.round(d.gvwrLbs) : null,
      sleeps: d.sleeps,
      slideCount: d.slideCount ?? 0,
      bunkhouse: d.bunkhouse,
      toyHauler: d.toyHauler,
      outdoorKitchen: d.outdoorKitchen,
      exteriorColor: d.exteriorColor,
      description: d.description,
      city: d.city,
      state: d.state,
      zipCode: d.zipCode,
    })
    .where(eq(inventory.id, inventoryId));

  await setFeatures(inventoryId, d.features);
  await logAudit({ action: "inventory.update", entityType: "inventory", entityId: inventoryId, dealershipId });
  revalidatePath("/dealer/inventory");
  revalidatePath(`/dealer/inventory/${inventoryId}`);
  return { ok: true, inventoryId };
}

export async function setInventoryStatus(
  dealershipId: string,
  inventoryId: string,
  status: "draft" | "published" | "sold" | "archived",
): Promise<void> {
  await requireDealerRole(dealershipId);
  await requireInventoryInDealership(dealershipId, inventoryId);
  await db
    .update(inventory)
    .set({ status, dateSold: status === "sold" ? new Date() : undefined })
    .where(eq(inventory.id, inventoryId));
  await logAudit({
    action: `inventory.status.${status}`,
    entityType: "inventory",
    entityId: inventoryId,
    dealershipId,
  });
  revalidatePath("/dealer/inventory");
  revalidatePath(`/dealer/inventory/${inventoryId}`);
}

export async function uploadInventoryPhotos(
  dealershipId: string,
  inventoryId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireDealerRole(dealershipId);
  await requireInventoryInDealership(dealershipId, inventoryId);
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: true };

  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      return { ok: false, error: `${file.name}: unsupported file type. Use JPEG, PNG, or WebP.` };
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: `${file.name}: exceeds the ${MAX_PHOTO_BYTES / 1024 / 1024}MB photo limit.` };
    }
  }

  const existingCount = await db
    .select({ id: inventoryPhotos.id })
    .from(inventoryPhotos)
    .where(eq(inventoryPhotos.inventoryId, inventoryId));

  let position = existingCount.length;
  let firstPhotoId: string | null = null;
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadBuffer(
      `photos/${inventoryId}/${Date.now()}-${position}.jpg`,
      buffer,
      file.type || "image/jpeg",
    );
    const [row] = await db
      .insert(inventoryPhotos)
      .values({ inventoryId, url, position })
      .returning({ id: inventoryPhotos.id });
    if (position === 0) firstPhotoId = row.id;
    position += 1;
  }

  if (firstPhotoId && existingCount.length === 0) {
    await db.update(inventory).set({ primaryPhotoId: firstPhotoId }).where(eq(inventory.id, inventoryId));
  }
  revalidatePath(`/dealer/inventory/${inventoryId}`);
  return { ok: true };
}

export async function uploadInventoryVideo(
  dealershipId: string,
  inventoryId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireDealerRole(dealershipId);
  await requireInventoryInDealership(dealershipId, inventoryId);
  const file = formData.get("video");
  if (!(file instanceof File) || file.size === 0) return { ok: true };

  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    return { ok: false, error: "Unsupported video type. Use MP4, MOV, or WebM." };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: `Video exceeds the ${MAX_VIDEO_BYTES / 1024 / 1024}MB limit.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadBuffer(`videos/${inventoryId}/${Date.now()}.mp4`, buffer, file.type || "video/mp4");

  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId, url, source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });

  // Dealer-uploaded video always takes priority over any generated video.
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, inventoryId));
  await logAudit({ action: "inventory.video.upload", entityType: "inventory", entityId: inventoryId, dealershipId });
  revalidatePath(`/dealer/inventory/${inventoryId}`);
  return { ok: true };
}

export async function setPrimaryVideo(dealershipId: string, inventoryId: string, videoId: string) {
  await requireDealerRole(dealershipId);
  await requireInventoryInDealership(dealershipId, inventoryId);
  await requireVideoBelongsToInventory(inventoryId, videoId);
  await db.update(inventory).set({ primaryVideoId: videoId }).where(eq(inventory.id, inventoryId));
  revalidatePath(`/dealer/inventory/${inventoryId}`);
}

/**
 * Enqueues a video generation job and returns immediately. FFmpeg encoding
 * is real CPU/wall-clock work (multiple photos, Ken-Burns motion, crossfade
 * concatenation) that can comfortably exceed a serverless request's time
 * budget, so this deliberately does NOT run the job inline - a dedicated
 * worker process (src/server/video/worker.ts, run via `npm run
 * video:worker` / scripts/run-video-worker.ts) claims and processes queued
 * jobs on its own schedule, independent of any request/response cycle. The
 * dealer UI (VideoManager) already polls for and displays queued /
 * processing / completed / failed status.
 */
export async function requestVideoGeneration(dealershipId: string, inventoryId: string) {
  const { userId } = await requireDealerRole(dealershipId);
  await requireInventoryInDealership(dealershipId, inventoryId);
  await db.insert(videoGenerationJobs).values({ inventoryId, requestedBy: userId });
  revalidatePath(`/dealer/inventory/${inventoryId}`);
}

/** Resets a failed job back to queued for the worker to pick up again - see requestVideoGeneration for why this doesn't process inline. */
export async function retryVideoGeneration(dealershipId: string, jobId: string, inventoryId: string) {
  await requireDealerRole(dealershipId);
  const job = await requireVideoJobInDealership(dealershipId, jobId);
  if (job.inventoryId !== inventoryId) {
    throw new Error("Video job does not match the requested RV.");
  }
  await db
    .update(videoGenerationJobs)
    .set({ status: "queued", errorMessage: null })
    .where(eq(videoGenerationJobs.id, jobId));
  revalidatePath(`/dealer/inventory/${inventoryId}`);
}

export async function redirectToInventory(inventoryId: string) {
  redirect(`/dealer/inventory/${inventoryId}`);
}
