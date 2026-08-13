import type { Metadata } from "next";
import Link from "next/link";

import { requireDealerContext } from "@/server/dealer/context";
import { getDealerKpis, getPilotSummary } from "@/server/dealer/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangeTabs } from "@/components/dealer/date-range-tabs";
import { formatPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "Dealer Dashboard" };
export const dynamic = "force-dynamic";

export default async function DealerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { dealership } = await requireDealerContext();
  const { range } = await searchParams;
  const sinceDays = range ? Number(range) : 30;

  const [kpis, pilot] = await Promise.all([
    getDealerKpis(dealership.id, sinceDays),
    getPilotSummary(dealership.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{dealership.name}</h1>
          <p className="text-sm text-muted-foreground">
            Is RV Match producing value for your dealership?
          </p>
        </div>
        <DateRangeTabs current={sinceDays} />
      </div>

      {pilot && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="font-medium">
                Founding Dealer Pilot —{" "}
                <span className="capitalize">{pilot.status.replace(/_/g, " ")}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Free for {pilot.trialDays} days or {pilot.salesThreshold} verified sales, whichever
                comes first.
              </p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-semibold">{pilot.daysRemaining}</p>
                <p className="text-xs text-muted-foreground">days remaining</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {pilot.verifiedSalesCount}/{pilot.salesThreshold}
                </p>
                <p className="text-xs text-muted-foreground">verified sales</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Inventory Live" value={kpis.inventoryLive} />
        <Kpi label="Videos Live" value={kpis.videosLive} />
        <Kpi label="Impressions" value={kpis.impressions} hint="video plays started" />
        <Kpi label="Qualified Views" value={kpis.qualifiedViews} hint="video completions" />
        <Kpi
          label="Completion Rate"
          value={kpis.completionRate !== null ? formatPercent(kpis.completionRate) : "—"}
        />
        <Kpi label="Likes" value={kpis.likes} />
        <Kpi label="Loves" value={kpis.loves} />
        <Kpi label="Passes" value={kpis.passes} />
        <Kpi label="Saves" value={kpis.saves} />
        <Kpi label="Leads" value={kpis.leadsCount} />
        <Kpi label="High-Intent Leads" value={kpis.highIntentLeads} />
        <Kpi label="Appointments" value={kpis.appointments} />
        <Kpi label="Reported Sales" value={kpis.reportedSales} />
        <Kpi label="Verified Sales" value={kpis.verifiedSales} />
        <Kpi
          label="Lead → Sale Conversion"
          value={kpis.leadToSaleConversion !== null ? formatPercent(kpis.leadToSaleConversion) : "—"}
        />
      </div>

      {kpis.inventoryLive === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Get your first RV live</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Add inventory manually or import a CSV to start appearing in consumer discovery.
            </p>
            <Link href="/dealer/inventory/new">
              <Badge variant="accent">Add your first RV →</Badge>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
      </CardContent>
    </Card>
  );
}
