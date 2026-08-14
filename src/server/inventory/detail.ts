import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  dealerships,
  inventory,
  inventoryFeatures,
  inventoryPhotos,
  inventoryVideos,
  savedInventory,
} from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { scoreOneInventory } from "@/server/recommendation/engine";
import { getDecisionsCount } from "@/server/recommendation/profile";
import { getRecentPriceDrop } from "@/server/inventory/price-history";

export async function getInventoryDetail(inventoryId: string) {
  const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
  if (!rv) return null;

  const [dealer, photos, videos, features] = await Promise.all([
    db.select().from(dealerships).where(eq(dealerships.id, rv.dealershipId)).limit(1),
    db
      .select()
      .from(inventoryPhotos)
      .where(eq(inventoryPhotos.inventoryId, rv.id))
      .orderBy(inventoryPhotos.position),
    db.select().from(inventoryVideos).where(eq(inventoryVideos.inventoryId, rv.id)),
    db.select().from(inventoryFeatures).where(eq(inventoryFeatures.inventoryId, rv.id)),
  ]);

  const consumerProfileId = await getOrCreateConsumerProfileId();
  const displayPriceCents = rv.advertisedPriceCents ?? rv.salePriceCents;
  const [decisionsCount, match, savedRow, priceDrop] = await Promise.all([
    getDecisionsCount(consumerProfileId),
    scoreOneInventory(consumerProfileId, rv),
    db
      .select({ id: savedInventory.id })
      .from(savedInventory)
      .where(
        and(
          eq(savedInventory.inventoryId, rv.id),
          eq(savedInventory.consumerProfileId, consumerProfileId),
        ),
      )
      .limit(1),
    getRecentPriceDrop(rv.id, displayPriceCents),
  ]);

  const primaryVideo = videos.find((v) => v.id === rv.primaryVideoId) ?? videos[0] ?? null;
  const otherVideos = videos.filter((v) => v.id !== primaryVideo?.id);

  return {
    rv,
    dealer: dealer[0] ?? null,
    photos,
    primaryVideo,
    otherVideos,
    features: features.map((f) => f.feature),
    fitScore: decisionsCount >= 3 ? match.fitScore : null,
    explanations: match.explanations,
    distanceMiles: match.distanceMiles,
    isSaved: savedRow.length > 0,
    consumerProfileId,
    priceDrop,
  };
}
