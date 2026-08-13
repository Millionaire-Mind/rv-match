import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, videoGenerationJobs } from "@/server/db/schema";

export async function getDealerInventoryList(dealershipId: string) {
  const rows = await db
    .select()
    .from(inventory)
    .where(eq(inventory.dealershipId, dealershipId))
    .orderBy(desc(inventory.createdAt));

  const ids = rows.map((r) => r.id);
  const jobRows = ids.length
    ? await db
        .select()
        .from(videoGenerationJobs)
        .where(inArray(videoGenerationJobs.inventoryId, ids))
        .orderBy(desc(videoGenerationJobs.createdAt))
    : [];

  const latestJobByInventory = new Map<string, (typeof jobRows)[number]>();
  for (const job of jobRows) {
    if (!latestJobByInventory.has(job.inventoryId)) latestJobByInventory.set(job.inventoryId, job);
  }

  return rows.map((rv) => ({
    ...rv,
    hasVideo: Boolean(rv.primaryVideoId),
    latestJobStatus: latestJobByInventory.get(rv.id)?.status ?? null,
  }));
}
