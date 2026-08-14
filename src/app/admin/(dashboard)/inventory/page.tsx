import type { Metadata } from "next";

import { listPlatformInventory } from "@/server/admin/platform-inventory";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

const statusVariant: Record<string, "secondary" | "accent" | "outline" | "warning" | "destructive"> = {
  draft: "outline",
  published: "accent",
  sold: "secondary",
  archived: "warning",
};

export default async function AdminInventoryPage() {
  const rows = await listPlatformInventory();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="text-sm text-muted-foreground">Every RV across every dealership, most recently added first.</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No inventory yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">RV</th>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Video</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {r.year} {r.make} {r.model}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.dealershipName}</td>
                  <td className="px-4 py-3">{formatCurrency(r.priceCents)}</td>
                  <td className="px-4 py-3">
                    {r.hasVideo ? (
                      <Badge variant="accent">Yes</Badge>
                    ) : (
                      <Badge variant="warning">Missing</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[r.status]} className="capitalize">
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(r.dateAdded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
