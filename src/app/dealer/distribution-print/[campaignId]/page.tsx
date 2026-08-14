import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";

import { db } from "@/server/db/client";
import { distributionCampaigns, inventory } from "@/server/db/schema";
import { requireDealerContext } from "@/server/dealer/context";
import { requireCampaignInDealership, requireDealerRole } from "@/server/auth/guards";
import { MARKETING_ROLES } from "@/server/dealer/permissions";
import { PrintButton } from "@/components/dealer/print-button";

export const metadata: Metadata = { title: "Print QR Signage" };
export const dynamic = "force-dynamic";

interface PrintSignagePageProps {
  params: Promise<{ campaignId: string }>;
}

/**
 * Gap 4D: a simple, print-friendly signage layout for a single campaign's
 * QR code - not a graphic-design tool, just a large scannable code with
 * the dealership name and (when the campaign targets one RV) that RV's
 * identity, styled to print cleanly via @media print in globals.css.
 */
export default async function PrintSignagePage({ params }: PrintSignagePageProps) {
  const { campaignId } = await params;
  const { dealership } = await requireDealerContext();
  await requireDealerRole(dealership.id, MARKETING_ROLES);
  await requireCampaignInDealership(dealership.id, campaignId);

  const [campaign] = await db
    .select()
    .from(distributionCampaigns)
    .where(eq(distributionCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) return null;

  const rv = campaign.inventoryId
    ? (await db.select().from(inventory).where(eq(inventory.id, campaign.inventoryId)).limit(1))[0]
    : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/go/${campaign.code}`;
  const qrDataUrl = await QRCode.toDataURL(link, { width: 480, margin: 1 });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 bg-white p-10 text-center text-black print:min-h-0">
      <div className="print:hidden">
        <PrintButton />
      </div>
      <p className="text-2xl font-semibold">{dealership.name}</p>
      {rv ? (
        <p className="text-lg">
          {rv.year} {rv.make} {rv.model}
        </p>
      ) : (
        <p className="text-lg">Scan to browse our inventory</p>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUrl} alt={`QR code for ${campaign.name}`} className="h-80 w-80" />
      <p className="text-xl font-medium">
        {rv ? "Would You Buy This RV? Scan to find out." : "Scan to Find Your RV"}
      </p>
      <p className="text-xs text-muted-foreground">{link}</p>
    </div>
  );
}
