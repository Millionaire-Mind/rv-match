import type { Metadata } from "next";
import Link from "next/link";

import { requireDealerContext } from "@/server/dealer/context";
import { getDealerLeads } from "@/server/dealer/leads-list";
import { LeadStatusBadge } from "@/components/dealer/lead-status-badge";
import { formatCurrency, formatRelativeDate } from "@/lib/utils";
import { leadStatusValues, leadCtaLabels } from "@/server/validation/enums";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function DealerLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { dealership } = await requireDealerContext();
  const { status } = await searchParams;
  const rows = await getDealerLeads(dealership.id, status);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Leads</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterLink label="All" active={!status} />
        {leadStatusValues.map((s) => (
          <FilterLink key={s} label={s} value={s} active={status === s} />
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No leads yet. Leads appear here as consumers request availability, ask questions, or
          request a walkthrough on your inventory.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">RV</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ lead, rv }) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dealer/leads/${lead.id}`} className="hover:text-accent">
                      {lead.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{lead.email ?? lead.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    {rv.year} {rv.make} {rv.model}
                    <p className="text-xs text-muted-foreground">{formatCurrency(rv.salePriceCents)}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{leadCtaLabels[lead.ctaType]}</td>
                  <td className="px-4 py-3">
                    {lead.matchScore !== null ? (
                      <Badge variant="outline">{Number(lead.matchScore)}/100</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.intentScore !== null ? (
                      <Badge variant={Number(lead.intentScore) >= 70 ? "accent" : "outline"}>
                        {Number(lead.intentScore)}/100
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterLink({ label, value, active }: { label: string; value?: string; active: boolean }) {
  return (
    <Link
      href={value ? `/dealer/leads?status=${value}` : "/dealer/leads"}
      className={`rounded-full px-3 py-1 capitalize ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/80"}`}
    >
      {label.replace(/_/g, " ")}
    </Link>
  );
}
