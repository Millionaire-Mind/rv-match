import type { Metadata } from "next";

import { listAllCampaigns } from "@/server/admin/platform-campaigns";
import { Badge } from "@/components/ui/badge";
import { CampaignActiveToggle } from "@/components/admin/campaign-active-toggle";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const rows = await listAllCampaigns();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <p className="text-sm text-muted-foreground">
        Every distribution link on the platform - dealer QR/link campaigns and creator referral links.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No campaigns yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Scans</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Verified Sales</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {c.name}
                    <p className="text-xs text-muted-foreground">{c.code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {c.campaignType.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.dealershipName ?? c.creatorName ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{c.scans}</td>
                  <td className="px-4 py-3 text-right">{c.leadsCount}</td>
                  <td className="px-4 py-3 text-right">{c.verifiedSales}</td>
                  <td className="px-4 py-3">
                    <Badge variant={c.active ? "accent" : "outline"}>{c.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(c.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <CampaignActiveToggle campaignId={c.id} active={c.active} />
                    </div>
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
