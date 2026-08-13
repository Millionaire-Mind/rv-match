import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { attributedSales, dealerships, inventory } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { SaleVerificationButtons } from "@/components/admin/sale-verification-buttons";
import { formatCurrency, formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Sale Verification" };
export const dynamic = "force-dynamic";

export default async function AdminSalesPage() {
  const rows = await db
    .select({ sale: attributedSales, dealership: dealerships, rv: inventory })
    .from(attributedSales)
    .innerJoin(dealerships, eq(attributedSales.dealershipId, dealerships.id))
    .innerJoin(inventory, eq(attributedSales.soldInventoryId, inventory.id))
    .orderBy(desc(attributedSales.createdAt));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Sale Verification</h1>
      <p className="text-sm text-muted-foreground">
        Only verified sales count toward a dealer&apos;s Founding Dealer pilot threshold.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No reported sales yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">RV</th>
                <th className="px-4 py-3">Sale Price</th>
                <th className="px-4 py-3">Reported</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sale, dealership, rv }) => (
                <tr key={sale.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{dealership.name}</td>
                  <td className="px-4 py-3">
                    {rv.year} {rv.make} {rv.model}
                  </td>
                  <td className="px-4 py-3">{sale.salePriceCents ? formatCurrency(sale.salePriceCents) : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(sale.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        sale.verificationStatus === "verified"
                          ? "accent"
                          : sale.verificationStatus === "rejected"
                            ? "destructive"
                            : "warning"
                      }
                      className="capitalize"
                    >
                      {sale.verificationStatus.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {sale.verificationStatus === "dealer_reported" && (
                      <div className="flex justify-end">
                        <SaleVerificationButtons saleId={sale.id} />
                      </div>
                    )}
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
