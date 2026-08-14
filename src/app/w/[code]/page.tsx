import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, distributionCampaigns, inventory, inventoryPhotos, inventoryVideos } from "@/server/db/schema";
import { discoveryEligible } from "@/server/inventory/eligibility";
import { VideoPlayer } from "@/components/discovery/video-player";
import { ReactionPanel } from "@/components/would-you-buy/reaction-panel";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Would You Buy This RV?" };
export const dynamic = "force-dynamic";

interface WouldYouBuyPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Gap 4B: the destination for a per-RV QR/link (see src/app/go/[code]/
 * route.ts, which resolves attribution and redirects here rather than
 * straight to the ordinary /rv/[id] detail page). A lightweight,
 * single-decision entry point - the reaction it collects is a real
 * preference signal via the same submitSwipeDecision path the swipe feed
 * uses (see ReactionPanel), not a throwaway poll.
 */
export default async function WouldYouBuyPage({ params }: WouldYouBuyPageProps) {
  const { code } = await params;

  const [campaign] = await db
    .select()
    .from(distributionCampaigns)
    .where(eq(distributionCampaigns.code, code))
    .limit(1);
  if (!campaign || !campaign.active || !campaign.inventoryId) notFound();

  const [rv] = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.id, campaign.inventoryId), discoveryEligible()))
    .limit(1);
  if (!rv) notFound();

  const [photoRows, videoRows, dealerRows] = await Promise.all([
    db.select().from(inventoryPhotos).where(eq(inventoryPhotos.inventoryId, rv.id)),
    db.select().from(inventoryVideos).where(inArray(inventoryVideos.inventoryId, [rv.id])),
    rv.dealershipId ? db.select().from(dealerships).where(eq(dealerships.id, rv.dealershipId)).limit(1) : Promise.resolve([]),
  ]);
  const primaryVideo =
    videoRows.find((v) => v.id === rv.primaryVideoId) ?? videoRows.find((v) => v.inventoryId === rv.id);
  const dealer = dealerRows[0] ?? null;

  const highlight = rv.bunkhouse
    ? "Bunkhouse"
    : rv.outdoorKitchen
      ? "Outdoor Kitchen"
      : rv.toyHauler
        ? "Toy Hauler"
        : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <div className="relative aspect-[9/16] max-h-[70vh] w-full bg-black">
        <VideoPlayer
          src={primaryVideo?.url ?? null}
          poster={photoRows[0]?.url ?? null}
          captionSrc={null}
          active
          allowTapToPause
          className="h-full w-full"
        />
      </div>
      <div className="flex-1 px-5 py-5">
        <h1 className="text-xl font-semibold">Would You Buy This RV?</h1>
        <p className="mt-2 text-lg font-medium leading-tight">
          {rv.year} {rv.make} {rv.model}
        </p>
        <p className="mt-1 text-2xl font-semibold">
          {formatCurrency(rv.advertisedPriceCents ?? rv.salePriceCents)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {[rv.sleeps ? `Sleeps ${rv.sleeps}` : null, highlight, dealer?.name].filter(Boolean).join(" · ")}
        </p>

        <ReactionPanel inventoryId={rv.id} rvDetailHref={`/rv/${rv.id}`} />
      </div>
    </main>
  );
}
