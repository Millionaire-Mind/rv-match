import type { Metadata } from "next";
import Link from "next/link";

import { requireDealerContext } from "@/server/dealer/context";
import { getDealerInventoryList } from "@/server/dealer/inventory-list";
import { InventoryTable } from "@/components/dealer/inventory-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function DealerInventoryPage() {
  const { dealership } = await requireDealerContext();
  const rows = await getDealerInventoryList(dealership.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dealer/inventory/feeds">Feed Sources</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dealer/inventory/import">Import CSV</Link>
          </Button>
          <Button asChild variant="accent">
            <Link href="/dealer/inventory/new">Add RV</Link>
          </Button>
        </div>
      </div>
      <InventoryTable dealershipId={dealership.id} rows={rows} />
    </div>
  );
}
