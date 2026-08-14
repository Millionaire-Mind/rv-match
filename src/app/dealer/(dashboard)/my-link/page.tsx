import type { Metadata } from "next";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";

import { requireDealerContext } from "@/server/dealer/context";
import { getOrCreateSalespersonCampaign } from "@/server/dealer/campaign-actions";
import { CopyLinkButton } from "@/components/dealer/copy-link-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My Referral Link" };
export const dynamic = "force-dynamic";

/**
 * Gap 4A: a self-service personal QR/link for any dealer staff member
 * (owner/sales_manager/salesperson) - distinct from the marketing-managed
 * Distribution Center, which stays gated to owner/marketing. Every scan,
 * lead, and verified sale that follows this link is attributed to this
 * specific person (see distribution_campaigns.salesperson_user_id and
 * leads/attributed_sales.first_salesperson_user_id).
 */
export default async function MyLinkPage() {
  const { dealership } = await requireDealerContext();
  const campaign = await getOrCreateSalespersonCampaign(dealership.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/go/${campaign.code}`;
  const qrDataUrl = await QRCode.toDataURL(link, { width: 220, margin: 1 });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Referral Link</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share this with a shopper - anyone who scans it or clicks through is credited to you, and stays
          credited to you all the way through to a lead or sale, even if it takes weeks.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Your personal QR code" className="h-32 w-32 rounded border border-border" />
          <div className="flex-1">
            <p className="break-all text-sm text-muted-foreground">{link}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyLinkButton link={link} />
              <Button asChild size="sm" variant="outline">
                <a href={qrDataUrl} download="my-rv-match-qr.png">
                  <Download className="h-4 w-4" />
                  Download QR
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`/dealer/distribution-print/${campaign.id}`} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4" />
                  Print
                </a>
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {campaign.scans} scans · {campaign.leadsCount} leads · {campaign.verifiedSales} verified sales
        </p>
      </div>
    </div>
  );
}
