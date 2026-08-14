import type { Metadata } from "next";

import { listPlatformLeads } from "@/server/admin/platform-leads";
import { Badge } from "@/components/ui/badge";
import { leadCtaLabels, leadStatusLabels } from "@/server/validation/enums";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const statusVariant: Record<string, "secondary" | "accent" | "outline" | "warning" | "destructive"> = {
  new: "warning",
  contacted: "outline",
  appointment: "accent",
  showroom: "accent",
  negotiation: "accent",
  sold: "secondary",
  lost: "destructive",
};

export default async function AdminLeadsPage() {
  const rows = await listPlatformLeads();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Leads</h1>
      <p className="text-sm text-muted-foreground">Every lead across every dealership, most recent first.</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No leads yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Consumer</th>
                <th className="px-4 py-3">RV</th>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">CTA</th>
                <th className="px-4 py-3 text-right">Intent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.rvLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.dealershipName}</td>
                  <td className="px-4 py-3">{leadCtaLabels[l.ctaType as keyof typeof leadCtaLabels] ?? l.ctaType}</td>
                  <td className="px-4 py-3 text-right">{l.intentScore !== null ? Math.round(l.intentScore) : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[l.status] ?? "secondary"} className="capitalize">
                      {leadStatusLabels[l.status as keyof typeof leadStatusLabels] ?? l.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
