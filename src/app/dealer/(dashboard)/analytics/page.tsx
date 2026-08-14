import type { Metadata } from "next";
import Link from "next/link";

import { requireDealerContext } from "@/server/dealer/context";
import { getPerRvAnalytics } from "@/server/dealer/rv-analytics";
import { getDemandIntelligence } from "@/server/dealer/demand-intelligence";
import { getCampaignContribution, getDealerTimeSeries } from "@/server/dealer/analytics-timeseries";
import { DateRangeTabs } from "@/components/dealer/date-range-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SparklineChart } from "@/components/dealer/charts/sparkline-chart";
import { BarChart } from "@/components/dealer/charts/bar-chart";
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

  const [rvRows, demandSignals, timeSeries, campaignContribution] = await Promise.all([
    getPerRvAnalytics(dealership.id, sinceDays),
    getDemandIntelligence(dealership.id, sinceDays > 0 ? sinceDays : 30),
    getDealerTimeSeries(dealership.id, sinceDays > 0 ? sinceDays : 30),
    getCampaignContribution(dealership.id, sinceDays),
  ]);

  const sortedRows = [...rvRows].sort((a, b) => b.impressions - a.impressions);

  const sum = (key: "impressions" | "engagement" | "leads" | "sales") =>
    timeSeries.reduce((s, p) => s + p[key], 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Per-RV performance and market demand vs. your inventory.</p>
        </div>
        <DateRangeTabs current={sinceDays} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SparklineChart label="Impressions" values={timeSeries.map((p) => p.impressions)} total={sum("impressions")} />
        <SparklineChart
          label="Engagement (Like/Love/More)"
          values={timeSeries.map((p) => p.engagement)}
          total={sum("engagement")}
          color="#3b82f6"
        />
        <SparklineChart label="Leads" values={timeSeries.map((p) => p.leads)} total={sum("leads")} color="#8b5cf6" />
        <SparklineChart
          label="Verified Sales"
          values={timeSeries.map((p) => p.sales)}
          total={sum("sales")}
          color="#22c55e"
        />
      </div>

      {campaignContribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Contribution</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Leads produced by each active distribution link.</p>
            <BarChart data={campaignContribution.map((c) => ({ label: c.name, value: c.leadsCount }))} />
          </CardContent>
        </Card>
      )}

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
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">RV</th>
                  <th className="py-2 pr-3">Impressions</th>
                  <th className="py-2 pr-3">Unique Viewers</th>
                  <th className="py-2 pr-3">Avg. Watch</th>
                  <th className="py-2 pr-3">Completion</th>
                  <th className="py-2 pr-3">PASS Rate</th>
                  <th className="py-2 pr-3">LIKE Rate</th>
                  <th className="py-2 pr-3">LOVE Rate</th>
                  <th className="py-2 pr-3">Save Rate</th>
                  <th className="py-2 pr-3">Lead Rate</th>
                  <th className="py-2 pr-3">Sale Conversion</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.inventoryId} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/dealer/inventory/${row.inventoryId}`} className="hover:underline">
                        {row.year} {row.make} {row.model}
                      </Link>
                      {row.status !== "published" && (
                        <Badge variant="secondary" className="ml-2">
                          {row.status}
                        </Badge>
                      )}
                      {row.insight && (
                        <p className="mt-1 text-xs font-normal text-accent">{row.insight}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3">{row.impressions}</td>
                    <td className="py-2 pr-3">{row.uniqueViewers}</td>
                    <td className="py-2 pr-3">
                      {row.avgWatchSeconds !== null ? `${Math.round(row.avgWatchSeconds)}s` : "—"}
                    </td>
                    <td className="py-2 pr-3">{row.completionRate !== null ? formatPercent(row.completionRate) : "—"}</td>
                    <td className="py-2 pr-3">{row.passRate !== null ? formatPercent(row.passRate) : "—"}</td>
                    <td className="py-2 pr-3">{row.likeRate !== null ? formatPercent(row.likeRate) : "—"}</td>
                    <td className="py-2 pr-3">{row.loveRate !== null ? formatPercent(row.loveRate) : "—"}</td>
                    <td className="py-2 pr-3">{row.saveRate !== null ? formatPercent(row.saveRate) : "—"}</td>
                    <td className="py-2 pr-3">
                      {row.leadRate !== null ? formatPercent(row.leadRate) : "—"} ({row.leadsCount})
                    </td>
                    <td className="py-2 pr-3">
                      {row.salesConversionRate !== null ? formatPercent(row.salesConversionRate) : "—"} (
                      {row.verifiedSales})
                    </td>
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
