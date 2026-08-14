import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { savedInventory } from "@/server/db/schema";
import { formatCurrency } from "@/lib/utils";
import { notifyConsumer } from "./create";

/**
 * Notifies every consumer who has this RV saved, but only on a genuine
 * price *drop* - a price increase isn't something a saver wants to hear
 * about. Called from both the manual dealer-edit path (inventory-actions.ts)
 * and CSV/feed import (inventory-upsert.ts), the two places a price can
 * actually change.
 */
export async function notifyPriceDropForSavers(
  inventoryId: string,
  oldPriceCents: number,
  newPriceCents: number,
  rvLabel: string,
): Promise<void> {
  if (newPriceCents >= oldPriceCents) return;

  const savers = await db
    .select({ consumerProfileId: savedInventory.consumerProfileId })
    .from(savedInventory)
    .where(eq(savedInventory.inventoryId, inventoryId));
  if (savers.length === 0) return;

  const drop = formatCurrency(oldPriceCents - newPriceCents);
  await Promise.all(
    savers.map((s) =>
      notifyConsumer(s.consumerProfileId, {
        type: "price_drop",
        title: `Price drop: ${rvLabel}`,
        body: `${rvLabel} you saved dropped by ${drop}, now ${formatCurrency(newPriceCents)}.`,
        link: `/rv/${inventoryId}`,
      }),
    ),
  );
}
