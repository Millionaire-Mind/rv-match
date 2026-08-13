import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { getInventoryDetail } from "@/server/inventory/detail";
import { RvDetailView } from "@/components/rv/rv-detail-view";
import { trackEvent } from "@/server/analytics/track";
import { updatePreferencesForEvent } from "@/server/recommendation/preferences";
import { loadRecommendationWeights } from "@/server/recommendation/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getInventoryDetail(id);
  if (!detail) return { title: "RV not found" };
  return { title: `${detail.rv.year} ${detail.rv.make} ${detail.rv.model}` };
}

export default async function RvDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getInventoryDetail(id);
  if (!detail || detail.rv.status === "archived") notFound();

  const { rv, dealer, photos, primaryVideo, features, fitScore, explanations, distanceMiles, isSaved, consumerProfileId } =
    detail;

  await Promise.all([
    trackEvent({
      consumerProfileId,
      eventType: "detail_view",
      inventoryId: rv.id,
      dealershipId: rv.dealershipId,
    }),
    trackEvent({
      consumerProfileId,
      eventType: "dealer_view",
      inventoryId: rv.id,
      dealershipId: rv.dealershipId,
    }),
    (async () => {
      const weights = await loadRecommendationWeights();
      await updatePreferencesForEvent(consumerProfileId, rv, "detail_view", weights);
    })(),
  ]);

  return (
    <main className="min-h-dvh bg-background pb-8">
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          href="/discover"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back to discovery"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="text-sm font-medium text-muted-foreground">
          {rv.year} {rv.make} {rv.model}
        </span>
      </div>

      {rv.status === "sold" && (
        <div className="mx-4 mb-4 rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning">
          This RV has sold. Browse similar available RVs from{" "}
          <Link href="/discover" className="underline">
            discovery
          </Link>
          .
        </div>
      )}

      <RvDetailView
        rv={{
          id: rv.id,
          year: rv.year,
          make: rv.make,
          model: rv.model,
          floorplan: rv.floorplan,
          rvType: rv.rvType,
          condition: rv.condition,
          msrpCents: rv.msrpCents,
          salePriceCents: rv.salePriceCents,
          advertisedPriceCents: rv.advertisedPriceCents,
          lengthInches: rv.lengthInches,
          dryWeightLbs: rv.dryWeightLbs,
          gvwrLbs: rv.gvwrLbs,
          sleeps: rv.sleeps,
          slideCount: rv.slideCount,
          bunkhouse: rv.bunkhouse,
          toyHauler: rv.toyHauler,
          outdoorKitchen: rv.outdoorKitchen,
          exteriorColor: rv.exteriorColor,
          description: rv.description,
          city: rv.city,
          state: rv.state,
          stockNumber: rv.stockNumber,
        }}
        dealer={dealer ? { id: dealer.id, name: dealer.name, city: dealer.city, state: dealer.state, phone: dealer.phone } : null}
        photos={photos.map((p) => p.url)}
        videoUrl={primaryVideo?.url ?? null}
        features={features}
        fitScore={fitScore}
        explanations={explanations}
        distanceMiles={distanceMiles}
        isSaved={isSaved}
      />
    </main>
  );
}
