import { rvTypeLabels, type RvType } from "@/server/validation/enums";
import type { ScoredInventory } from "@/server/recommendation/engine";

export interface DiscoveryCardDTO {
  id: string;
  year: number;
  make: string;
  model: string;
  floorplan: string | null;
  rvTypeLabel: string;
  condition: "new" | "used";
  priceCents: number;
  msrpCents: number | null;
  city: string | null;
  state: string | null;
  distanceMiles: number | null;
  sleeps: number | null;
  slideCount: number | null;
  bunkhouse: boolean;
  toyHauler: boolean;
  outdoorKitchen: boolean;
  dealerName: string;
  dealerId: string;
  photos: string[];
  videoUrl: string | null;
  videoCaptionUrl: string | null;
  fitScore: number;
  isExploration: boolean;
  explanations: string[];
}

export function toDiscoveryCardDTO(
  scored: ScoredInventory,
  dealer: { id: string; name: string },
  photos: string[],
): DiscoveryCardDTO {
  const rv = scored.inventory;
  return {
    id: rv.id,
    year: rv.year,
    make: rv.make,
    model: rv.model,
    floorplan: rv.floorplan,
    rvTypeLabel: rvTypeLabels[rv.rvType as RvType] ?? rv.rvType,
    condition: rv.condition,
    priceCents: rv.advertisedPriceCents ?? rv.salePriceCents,
    msrpCents: rv.msrpCents,
    city: rv.city,
    state: rv.state,
    distanceMiles: scored.distanceMiles,
    sleeps: rv.sleeps,
    slideCount: rv.slideCount,
    bunkhouse: rv.bunkhouse,
    toyHauler: rv.toyHauler,
    outdoorKitchen: rv.outdoorKitchen,
    dealerName: dealer.name,
    dealerId: dealer.id,
    photos,
    videoUrl: scored.primaryVideoUrl,
    videoCaptionUrl: scored.primaryVideoCaptionUrl,
    fitScore: scored.fitScore,
    isExploration: scored.isExploration,
    explanations: scored.explanations,
  };
}
