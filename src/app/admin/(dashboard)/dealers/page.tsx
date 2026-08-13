import type { Metadata } from "next";
import { desc } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { DealerActionButtons } from "@/components/admin/dealer-actions-buttons";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dealers" };
export const dynamic = "force-dynamic";

const statusVariant: Record<string, "secondary" | "accent" | "outline" | "warning" | "destructive"> = {
  pending: "warning",
  approved: "accent",
  suspended: "outline",
  rejected: "destructive",
};

export default async function AdminDealersPage() {
  const rows = await db.select().from(dealerships).orderBy(desc(dealerships.appliedAt));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dealers</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No dealer applications yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Dealership</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {d.name}
                    <p className="text-xs text-muted-foreground">
                      {d.city}, {d.state}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {d.primaryContactName}
                    <p className="text-xs text-muted-foreground">{d.primaryContactEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(d.appliedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[d.status]} className="capitalize">
                      {d.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <DealerActionButtons dealershipId={d.id} status={d.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
