import type { Metadata } from "next";

import { getActivationFunnel, getPlatformTotals } from "@/server/admin/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin Overview" };
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [totals, funnel] = await Promise.all([getPlatformTotals(), getActivationFunnel()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">
          Every number below is a live database aggregation — nothing hardcoded.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Approved Dealers" value={totals.dealershipsApproved} />
        <Kpi label="Pending Dealers" value={totals.dealershipsPending} />
        <Kpi label="Published Inventory" value={totals.inventoryPublished} />
        <Kpi label="Shoppers (total)" value={totals.consumersTotal} />
        <Kpi label="Registered Accounts" value={totals.consumersRegistered} />
        <Kpi label="Leads" value={totals.leadsTotal} />
        <Kpi label="Appointments" value={totals.appointmentsTotal} />
        <Kpi label="Verified Sales" value={totals.salesVerified} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acquisition & Activation Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelBar label="Discovery Starters" value={funnel.discoveryStarters} max={funnel.discoveryStarters} />
          <FunnelBar label="3+ Decisions" value={funnel.threeDecisionUsers} max={funnel.discoveryStarters} />
          <FunnelBar label="Activated Shoppers (10+)" value={funnel.activatedShoppers} max={funnel.discoveryStarters} />
          <FunnelBar label="Match Completers (20+)" value={funnel.matchCompleters} max={funnel.discoveryStarters} />
          <FunnelBar label="Accounts Created" value={funnel.accountsCreated} max={funnel.discoveryStarters} />
          <FunnelBar label="Leads Submitted" value={funnel.leads} max={funnel.discoveryStarters} />
          <p className="mt-4 text-xs text-muted-foreground">
            Activation rate (Activated Shoppers / Discovery Starters):{" "}
            {funnel.discoveryStarters > 0
              ? `${Math.round((funnel.activatedShoppers / funnel.discoveryStarters) * 100)}%`
              : "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
