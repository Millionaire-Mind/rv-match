import type { Metadata } from "next";

import { getPlatformTotals } from "@/server/admin/analytics";
import { getAcquisitionFunnelBySource } from "@/server/admin/funnel";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "First 10,000" };
export const dynamic = "force-dynamic";

const FIRST_MILESTONE = 10_000;

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  qr: "Dealer QR / Link",
  creator: "Creator Referral",
  partner: "Partner Invite",
  unknown: "Unknown",
};

export default async function AdminFunnelPage() {
  const [totals, segments] = await Promise.all([getPlatformTotals(), getAcquisitionFunnelBySource()]);
  const progressPct = Math.min(100, (totals.consumersTotal / FIRST_MILESTONE) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">First 10,000</h1>
        <p className="text-sm text-muted-foreground">
          Progress toward the first 10,000 consumer profiles, broken out by first-touch acquisition source.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-semibold">{totals.consumersTotal.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">of {FIRST_MILESTONE.toLocaleString()}</p>
        </div>
        <Progress value={progressPct} className="mt-2" />
      </div>

      <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        Segmented by the source recorded on a shopper&apos;s very first visit (never overwritten later). &quot;Dealer
        QR / Link&quot; covers every dealer-generated distribution link, however it was shared. Social-media and
        search-engine referrals aren&apos;t yet distinguishable from Direct - that requires UTM capture this
        platform doesn&apos;t have yet - so no separate &quot;Social&quot; or &quot;Organic&quot; number is shown
        rather than estimate one.
      </div>

      {segments.length === 0 ? (
        <p className="text-muted-foreground">No sessions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Sessions</th>
                <th className="px-4 py-3 text-right">3+ Decisions</th>
                <th className="px-4 py-3 text-right">Activated (10+)</th>
                <th className="px-4 py-3 text-right">Accounts</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Verified Sales</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.source} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    <Badge variant="outline">{SOURCE_LABELS[s.source] ?? s.source}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{s.sessionsStarted}</td>
                  <td className="px-4 py-3 text-right">{s.threeDecisionUsers}</td>
                  <td className="px-4 py-3 text-right">{s.activatedShoppers}</td>
                  <td className="px-4 py-3 text-right">{s.accountsCreated}</td>
                  <td className="px-4 py-3 text-right">{s.leadsCount}</td>
                  <td className="px-4 py-3 text-right">{s.verifiedSales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
