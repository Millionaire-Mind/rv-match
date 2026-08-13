import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { requireDealerContext } from "@/server/dealer/context";
import { db } from "@/server/db/client";
import { inventoryFeedSources } from "@/server/db/schema";
import { FeedSourceForm } from "@/components/dealer/feed-source-form";
import { FeedSourceList } from "@/components/dealer/feed-source-list";

export const metadata: Metadata = { title: "Inventory Feed Sources" };
export const dynamic = "force-dynamic";

export default async function InventoryFeedsPage() {
  const { dealership } = await requireDealerContext();

  const sources = await db
    .select()
    .from(inventoryFeedSources)
    .where(eq(inventoryFeedSources.dealershipId, dealership.id))
    .orderBy(desc(inventoryFeedSources.createdAt));

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Inventory Feed Sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a manufacturer or distributor&apos;s CSV, JSON, or XML inventory feed. Re-running a
          feed updates existing RVs by stock number instead of creating duplicates, the same as CSV
          import.
        </p>
      </div>

      <FeedSourceList dealershipId={dealership.id} sources={sources} />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Add a feed source</h2>
        <FeedSourceForm dealershipId={dealership.id} />
      </div>
    </div>
  );
}
