"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { consumerProfiles } from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { geocodeZip } from "@/server/geo/zip-centroids";
import { trackEvent } from "@/server/analytics/track";

const zipSchema = z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP code.");
const radiusMilesSchema = z.number().int().positive().max(500);
const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

export async function submitZipCode(zip: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = zipSchema.safeParse(zip);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const geo = geocodeZip(parsed.data);
  if (!geo) return { ok: false, error: "We couldn't place that ZIP code. Try another." };

  const consumerProfileId = await getOrCreateConsumerProfileId();
  await db
    .update(consumerProfiles)
    .set({ zipCode: parsed.data, lat: geo.lat.toFixed(6), lng: geo.lng.toFixed(6) })
    .where(eq(consumerProfiles.id, consumerProfileId));

  await trackEvent({
    consumerProfileId,
    eventType: "location_added",
    metadata: { zip: parsed.data },
  });

  return { ok: true };
}

export async function setSearchRadius(radiusMiles: number): Promise<void> {
  const parsed = radiusMilesSchema.safeParse(radiusMiles);
  if (!parsed.success) return;

  const consumerProfileId = await getOrCreateConsumerProfileId();
  await db
    .update(consumerProfiles)
    .set({ radiusMiles: parsed.data })
    .where(eq(consumerProfiles.id, consumerProfileId));
}

/**
 * Gap 8: optional browser geolocation, alongside (never replacing) ZIP
 * entry. Rounded to 3 decimal places (~110m) rather than the browser's
 * native precision (often within a few meters) - accurate enough for
 * "which dealers are nearby" radius filtering, the only thing this value
 * is ever used for (see recommendation/engine.ts and
 * recommendation/purchase-intent.ts), without storing a consumer's exact
 * location. Dealers never see raw consumer coordinates in any view - only
 * derived distance.
 */
export async function submitGeolocation(lat: number, lng: number): Promise<void> {
  const parsedLat = latSchema.safeParse(lat);
  const parsedLng = lngSchema.safeParse(lng);
  if (!parsedLat.success || !parsedLng.success) return;

  const consumerProfileId = await getOrCreateConsumerProfileId();
  await db
    .update(consumerProfiles)
    .set({ lat: parsedLat.data.toFixed(3), lng: parsedLng.data.toFixed(3) })
    .where(eq(consumerProfiles.id, consumerProfileId));
  await trackEvent({ consumerProfileId, eventType: "location_added", metadata: { source: "geolocation" } });
}

export async function getConsumerLocationState(): Promise<{
  hasLocation: boolean;
  zipCode: string | null;
  radiusMiles: number;
  decisionsCount: number;
}> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const [row] = await db
    .select()
    .from(consumerProfiles)
    .where(eq(consumerProfiles.id, consumerProfileId))
    .limit(1);
  return {
    hasLocation: Boolean(row?.lat && row?.lng),
    zipCode: row?.zipCode ?? null,
    radiusMiles: row?.radiusMiles ?? 100,
    decisionsCount: row?.decisionsCount ?? 0,
  };
}
