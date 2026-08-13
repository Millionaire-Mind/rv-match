import type { Metadata } from "next";
import Link from "next/link";

import { requireDealerContext } from "@/server/dealer/context";
import { getPerRvAnalytics } from "@/server/dealer/rv-analytics";
import { getDemandIntelligence } from "@/server/dealer/demand-intelligence";
import { DateRangeTabs } from "@/components/dealer/date-range-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function DealerAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { dealership } = await requireDealerContext();
  const { range } = await searchParams;
  const sinceDays = range ? Number(range) : 30;

  const [rvRows, demandSignals] = await Promise.all([
    getPerRvAnalytics(dealership.id, sinceDays),
    getDemandIntelligence(dealership.id, sinceDays > 0 ? sinceDays : 30),
  ]);

  const sortedRows = [...rvRows].sort((a, b) => b.impressions - a.impressions);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Per-RV performance and market demand vs. your inventory.</p>
        </div>
        <DateRangeTabs current={sinceDays} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demand Intelligence</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            What shoppers across RV Match are responding to right now, compared to how much of it
            you currently have published. Aggregate signal only — never tied to any individual
            shopper.
          </p>
          {demandSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough platform-wide activity yet to surface a signal.</p>
          ) : (
            <div className="space-y-2">
              {demandSignals.map((signal) => (
                <div
                  key={`${signal.attribute}-${signal.value}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <span className="font-medium">{signal.label}</span>
                  <span className="text-muted-foreground">
                    {signal.marketDemandCount} shopper reactions · you have {signal.dealerInventoryCount} published
                  </span>
                  {signal.dealerInventoryCount === 0 && <Badge variant="warning">Gap</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-RV Performance</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sortedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inventory yet.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">RV</th>
                  <th className="py-2 pr-3">Impressions</th>
                  <th className="py-2 pr-3">Completion</th>
                  <th className="py-2 pr-3">Love / More Like This</th>
                  <th className="py-2 pr-3">Passes</th>
                  <th className="py-2 pr-3">Saves</th>
                  <th className="py-2 pr-3">Leads</th>
                  <th className="py-2 pr-3">Verified Sales</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.inventoryId} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/dealer/inventory/${row.inventoryId}`} className="hover:underline">
                        {row.year} {row.make} {row.model}
                      </Link>
                      {row.status !== "published" && (
                        <Badge variant="secondary" className="ml-2">
                          {row.status}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">{row.impressions}</td>
                    <td className="py-2 pr-3">{row.completionRate !== null ? formatPercent(row.completionRate) : "—"}</td>
                    <td className="py-2 pr-3">
                      {row.loves} / {row.moreLikeThis}
                    </td>
                    <td className="py-2 pr-3">{row.passes}</td>
                    <td className="py-2 pr-3">{row.saves}</td>
                    <td className="py-2 pr-3">{row.leadsCount}</td>
                    <td className="py-2 pr-3">{row.verifiedSales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
