import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import QRCode from "qrcode";

import { requireDealerContext } from "@/server/dealer/context";
import { db } from "@/server/db/client";
import { inventory } from "@/server/db/schema";
import { getDealerCampaigns } from "@/server/dealer/campaign-actions";
import { CampaignForm } from "@/components/dealer/campaign-form";
import { CampaignList } from "@/components/dealer/campaign-list";

export const metadata: Metadata = { title: "Distribution Center" };
export const dynamic = "force-dynamic";

export default async function DistributionCenterPage() {
  const { dealership } = await requireDealerContext();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const [campaigns, inventoryRows] = await Promise.all([
    getDealerCampaigns(dealership.id),
    db
      .select({ id: inventory.id, year: inventory.year, make: inventory.make, model: inventory.model })
      .from(inventory)
      .where(eq(inventory.dealershipId, dealership.id))
      .orderBy(desc(inventory.createdAt)),
  ]);

  const qrDataUrls: Record<string, string> = {};
  await Promise.all(
    campaigns.map(async (c) => {
      qrDataUrls[c.id] = await QRCode.toDataURL(`${appUrl}/go/${c.code}`, { width: 160, margin: 1 });
    }),
  );

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Distribution Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a QR code or shareable link for your lot, a printed flyer, or one specific RV.
          Every scan and every lead or sale that follows it is tracked back to this link, forever -
          even if the shopper doesn&apos;t buy until weeks later.
        </p>
      </div>

      <CampaignList dealershipId={dealership.id} campaigns={campaigns} appUrl={appUrl} qrDataUrls={qrDataUrls} />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Create a new link</h2>
        <CampaignForm
          dealershipId={dealership.id}
          inventoryOptions={inventoryRows.map((rv) => ({ id: rv.id, label: `${rv.year} ${rv.make} ${rv.model}` }))}
        />
      </div>
    </div>
  );
}
