import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, swipeDecisions } from "@/server/db/schema";
import { attributesForInventory, type InventoryRow } from "@/server/recommendation/attributes";
import { ATTRIBUTE_LABELS } from "@/server/recommendation/profile";

/**
 * Attributes worth surfacing as a demand/gap signal - not every attribute
 * attributesForInventory() emits. "dealer" is derivation plumbing (the
 * RV's own dealership id, not a shopper preference), and "floorplan" has
 * too many near-unique values to be a meaningful aggregate signal.
 */
const DEMAND_ATTRIBUTES = new Set([
  "rv_type",
  "make",
  "condition",
  "price_band",
  "length_band",
  "sleeps_band",
  "bunkhouse",
  "toy_hauler",
  "outdoor_kitchen",
]);

const MIN_MARKET_DEMAND = 3; // filters out noise from a handful of swipes

export interface DemandSignal {
  attribute: string;
  value: string;
  label: string;
  marketDemandCount: number;
  dealerInventoryCount: number;
  gapScore: number;
}

/**
 * Aggregate, privacy-safe demand intelligence: which RV attributes are
 * drawing genuine positive interest (love / more_like_this swipes) across
 * the *whole platform* right now, versus how much of that this specific
 * dealer currently has published - surfacing "shoppers want this, you
 * barely stock it" gaps. Nothing here is scoped to, or reveals, any
 * individual consumer - only aggregate counts across all shoppers.
 */
export async function getDemandIntelligence(dealershipId: string, sinceDays = 30, limit = 10): Promise<DemandSignal[]> {
  const since = new Date(Date.now() - sinceDays * 86400000);

  const [interestedSwipes, dealerInventory] = await Promise.all([
    db
      .select({ inventory })
      .from(swipeDecisions)
      .innerJoin(inventory, eq(inventory.id, swipeDecisions.inventoryId))
      .where(and(inArray(swipeDecisions.decision, ["love", "more_like_this"]), gte(swipeDecisions.createdAt, since))),
    db.select().from(inventory).where(and(eq(inventory.dealershipId, dealershipId), eq(inventory.status, "published"))),
  ]);

  const marketDemand = new Map<string, number>();
  for (const { inventory: rv } of interestedSwipes) {
    for (const { attribute, value } of attributesForInventory(rv as InventoryRow)) {
      if (!DEMAND_ATTRIBUTES.has(attribute)) continue;
      const key = `${attribute}::${value}`;
      marketDemand.set(key, (marketDemand.get(key) ?? 0) + 1);
    }
  }

  const dealerCounts = new Map<string, number>();
  for (const rv of dealerInventory) {
    for (const { attribute, value } of attributesForInventory(rv)) {
      if (!DEMAND_ATTRIBUTES.has(attribute)) continue;
      const key = `${attribute}::${value}`;
      dealerCounts.set(key, (dealerCounts.get(key) ?? 0) + 1);
    }
  }

  const signals: DemandSignal[] = [];
  for (const [key, marketDemandCount] of marketDemand) {
    if (marketDemandCount < MIN_MARKET_DEMAND) continue;
    const [attribute, value] = key.split("::");
    const dealerInventoryCount = dealerCounts.get(key) ?? 0;
    const gapScore = marketDemandCount / (dealerInventoryCount + 1);
    signals.push({
      attribute,
      value,
      label: (ATTRIBUTE_LABELS[attribute] ?? ((v: string) => v))(value),
      marketDemandCount,
      dealerInventoryCount,
      gapScore,
    });
  }

  return signals.sort((a, b) => b.gapScore - a.gapScore).slice(0, limit);
}
