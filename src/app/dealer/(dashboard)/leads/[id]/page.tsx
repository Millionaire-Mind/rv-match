import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { requireDealerContext } from "@/server/dealer/context";
import { db } from "@/server/db/client";
import { inventory, leadActivity, leads, profiles } from "@/server/db/schema";
import { getDealerTeam } from "@/server/dealer/leads-list";
import { LeadStatusBadge } from "@/components/dealer/lead-status-badge";
import { LeadDetailPanel } from "@/components/dealer/lead-detail-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelativeDate } from "@/lib/utils";
import { leadCtaLabels } from "@/server/validation/enums";

export const metadata: Metadata = { title: "Lead detail" };
export const dynamic = "force-dynamic";

interface BehaviorSnapshot {
  rvsViewed?: number;
  likes?: number;
  loves?: number;
  passes?: number;
  moreLikeThis?: number;
  saves?: number;
  topPreferences?: { label: string; strength: number }[];
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dealership } = await requireDealerContext();

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead || lead.dealershipId !== dealership.id) notFound();

  const [rv, activityRows, team, dealerInventoryRows] = await Promise.all([
    db.select().from(inventory).where(eq(inventory.id, lead.inventoryId)).limit(1),
    db
      .select({ activity: leadActivity, actorName: profiles.fullName, actorEmail: profiles.email })
      .from(leadActivity)
      .leftJoin(profiles, eq(leadActivity.actorId, profiles.id))
      .where(eq(leadActivity.leadId, id))
      .orderBy(desc(leadActivity.createdAt)),
    getDealerTeam(dealership.id),
    db
      .select({ id: inventory.id, year: inventory.year, make: inventory.make, model: inventory.model, stockNumber: inventory.stockNumber })
      .from(inventory)
      .where(eq(inventory.dealershipId, dealership.id)),
  ]);

  const snapshot = (lead.behaviorSnapshot ?? {}) as BehaviorSnapshot;
  const reasons = (lead.intentReasons ?? []) as string[];

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{lead.name}</h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="text-muted-foreground">
            {lead.email} {lead.phone && `· ${lead.phone}`} · prefers {lead.preferredContact}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Interested in</CardTitle>
          </CardHeader>
          <CardContent>
            {rv[0] && (
              <p>
                {rv[0].year} {rv[0].make} {rv[0].model} — {formatCurrency(rv[0].salePriceCents)} (stock #
                {rv[0].stockNumber})
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Used &quot;{leadCtaLabels[lead.ctaType]}&quot; · {formatRelativeDate(lead.createdAt)}
            </p>
            {lead.message && <p className="mt-2 text-sm">&quot;{lead.message}&quot;</p>}
          </CardContent>
        </Card>

        <LeadDetailPanel
          dealershipId={dealership.id}
          leadId={lead.id}
          currentStatus={lead.status}
          team={team}
          assignedTo={lead.assignedTo}
          dealerInventory={dealerInventoryRows.map((r) => ({
            id: r.id,
            label: `${r.year} ${r.make} ${r.model} (#${r.stockNumber})`,
          }))}
          defaultSoldInventoryId={lead.inventoryId}
          activity={activityRows.map((a) => ({
            id: a.activity.id,
            activityType: a.activity.activityType,
            note: a.activity.note,
            fromStatus: a.activity.fromStatus,
            toStatus: a.activity.toStatus,
            createdAt: a.activity.createdAt,
            actorName: a.actorName ?? a.actorEmail ?? null,
          }))}
        />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Purchase Intent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {lead.intentScore !== null ? Number(lead.intentScore) : "—"}
              <span className="text-base font-normal text-muted-foreground">/100</span>
            </p>
            {reasons.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Match Score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {lead.matchScore !== null ? Number(lead.matchScore) : "—"}
              <span className="text-base font-normal text-muted-foreground">/100</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              How well this RV fit this shopper&apos;s preferences at the moment they submitted this
              lead. Frozen at submission — it never changes as their preferences evolve later.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shopper behavior</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>RVs viewed: {snapshot.rvsViewed ?? 0}</p>
            <p>Liked: {snapshot.likes ?? 0}</p>
            <p>Loved: {snapshot.loves ?? 0}</p>
            <p>Asked for &quot;more like this&quot;: {snapshot.moreLikeThis ?? 0}</p>
            <p>Passed on: {snapshot.passes ?? 0}</p>
            <p>Saved: {snapshot.saves ?? 0}</p>
            {snapshot.topPreferences && snapshot.topPreferences.length > 0 && (
              <div>
                <p className="mt-2 font-medium">Strongest preferences</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {snapshot.topPreferences.map((p) => (
                    <Badge key={p.label} variant="outline">
                      {p.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              This summary reflects shopping behavior only — not demographic, financial, or other
              sensitive inferences.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
