"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteCampaign, setCampaignActive, type CampaignWithStats } from "@/server/dealer/campaign-actions";
import { formatRelativeDate } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  dealer_general: "General",
  dealer_inventory: "Specific RV",
  creator: "Creator",
  salesperson: "Salesperson",
};

export function CampaignList({
  dealershipId,
  campaigns,
  appUrl,
  qrDataUrls,
}: {
  dealershipId: string;
  campaigns: CampaignWithStats[];
  appUrl: string;
  qrDataUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyLink(code: string, id: string) {
    await navigator.clipboard.writeText(`${appUrl}/go/${code}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleActive(id: string, active: boolean) {
    startTransition(async () => {
      await setCampaignActive(dealershipId, id, active);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this campaign link/QR code? Existing leads and sales keep their recorded attribution.")) return;
    startTransition(async () => {
      await deleteCampaign(dealershipId, id);
      router.refresh();
    });
  }

  if (campaigns.length === 0) {
    return <p className="text-muted-foreground">No distribution links yet.</p>;
  }

  return (
    <div className="space-y-3">
      {campaigns.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {qrDataUrls[c.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrls[c.id]} alt={`QR code for ${c.name}`} className="h-20 w-20 shrink-0 rounded border border-border" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {c.name} <Badge variant="outline">{TYPE_LABELS[c.campaignType] ?? c.campaignType}</Badge>
                {!c.active && <Badge variant="secondary">Paused</Badge>}
              </p>
              {c.inventoryLabel && <p className="text-sm text-muted-foreground">{c.inventoryLabel}</p>}
              <p className="mt-1 text-sm text-muted-foreground">{appUrl}/go/{c.code}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Created {formatRelativeDate(c.createdAt)} · {c.scans} scans · {c.leadsCount} leads · {c.verifiedSales} verified sales
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copyLink(c.code, c.id)}>
                {copiedId === c.id ? "Copied" : "Copy Link"}
              </Button>
              {qrDataUrls[c.id] && (
                <Button asChild size="sm" variant="outline">
                  {/* A data: URL with the download attribute triggers a
                      normal browser file save - no server round-trip
                      needed since the PNG was already rendered client-side
                      into this data URL when the page loaded. */}
                  <a href={qrDataUrls[c.id]} download={`${c.name.replace(/\s+/g, "-").toLowerCase()}-qr.png`}>
                    <Download className="h-4 w-4" />
                    Download QR
                  </a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={`/dealer/distribution-print/${c.id}`} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4" />
                  Print
                </Link>
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleActive(c.id, !c.active)}>
                {c.active ? "Pause" : "Resume"}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(c.id)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
