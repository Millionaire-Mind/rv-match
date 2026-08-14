import type { Metadata } from "next";

import { getPlatformTotals } from "@/server/admin/analytics";
import { getAcquisitionFunnelBySource } from "@/server/admin/funnel";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "First 10,000" };
export const dynamic = "force-dynamic";

const FIRST_MILESTONE = 10_000;

/** Every value src/server/attribution/source.ts's ACQUISITION_SOURCES can
 * actually produce (Gap 4F), plus "unknown" for a session predating that
 * taxonomy. Never collapsed into "Direct" - social/organic/referral are
 * real, distinct buckets once UTM/referrer data exists for them. */
const SOURCE_LABELS: Record<string, string> = {
  dealer: "Dealer Link",
  salesperson: "Salesperson Link",
  qr: "Dealer QR (per-RV)",
  campaign: "Marketing Campaign",
  creator: "Creator Referral",
  social: "Social Media",
  organic: "Organic Search",
  referral: "Referral",
  partner: "Partner Invite",
  direct: "Direct",
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
        Segmented by the source recorded on a shopper&apos;s very first visit (never overwritten later), using the
        full acquisition taxonomy - Dealer Link, Salesperson Link, Dealer QR, Marketing Campaign, Creator Referral,
        Social Media, Organic Search, Referral, Partner Invite, and Direct. Social/organic/referral traffic is only
        distinguished from Direct once its UTM tag or HTTP referrer is present; a session with neither genuinely
        can&apos;t be told apart from Direct and is counted there rather than guessed.
      </div>

      {segments.length === 0 ? (
        <p className="text-muted-foreground">No sessions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Visitors</th>
                <th className="px-4 py-3 text-right">Discovery Starts</th>
                <th className="px-4 py-3 text-right">3+ Decisions</th>
                <th className="px-4 py-3 text-right">Activated (10+)</th>
                <th className="px-4 py-3 text-right">Match Completed (20)</th>
                <th className="px-4 py-3 text-right">Accounts</th>
                <th className="px-4 py-3 text-right">Returning</th>
                <th className="px-4 py-3 text-right">Partner Invites</th>
                <th className="px-4 py-3 text-right">Dealer Contacts</th>
                <th className="px-4 py-3 text-right">Appointments</th>
                <th className="px-4 py-3 text-right">Sold (reported)</th>
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
                  <td className="px-4 py-3 text-right">{s.discoveryStarters}</td>
                  <td className="px-4 py-3 text-right">{s.threeDecisionUsers}</td>
                  <td className="px-4 py-3 text-right">{s.activatedShoppers}</td>
                  <td className="px-4 py-3 text-right">{s.matchCompleters}</td>
                  <td className="px-4 py-3 text-right">{s.accountsCreated}</td>
                  <td className="px-4 py-3 text-right">{s.returningShoppers}</td>
                  <td className="px-4 py-3 text-right">{s.partnerInvites}</td>
                  <td className="px-4 py-3 text-right">{s.leadsCount}</td>
                  <td className="px-4 py-3 text-right">{s.appointmentsCount}</td>
                  <td className="px-4 py-3 text-right">{s.reportedSales}</td>
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
