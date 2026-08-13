import Link from "next/link";
import { PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDistance } from "@/lib/utils";
import type { SearchResultCard } from "@/server/search/query";

/**
 * Every result here is discoveryEligible() (see searchInventory) - video-first
 * is enforced for traditional search results too, not just the swipe feed and
 * Match. This grid intentionally mirrors the Match/Saved card convention
 * (photo + PlayCircle overlay, no autoplay) rather than becoming a generic
 * static listing grid.
 */
export function SearchResultsGrid({ results }: { results: SearchResultCard[] }) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <h2 className="text-lg font-semibold">No RVs match those filters</h2>
        <p className="max-w-sm text-muted-foreground">Try widening your price range, distance, or removing a filter.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((rv) => (
        <Link
          key={rv.id}
          href={`/rv/${rv.id}`}
          className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent"
        >
          <div className="relative aspect-video bg-secondary">
            {rv.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rv.photoUrl} alt="" className="h-full w-full object-cover" />
            )}
            {rv.videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
                <PlayCircle className="h-12 w-12 text-white drop-shadow" strokeWidth={1.5} />
              </div>
            )}
            <Badge variant={rv.condition === "new" ? "accent" : "secondary"} className="absolute left-2 top-2">
              {rv.condition === "new" ? "New" : "Used"}
            </Badge>
          </div>
          <div className="p-3">
            <p className="font-medium leading-tight">
              {rv.year} {rv.make} {rv.model}
            </p>
            <p className="text-sm text-muted-foreground">
              {rv.dealerName}
              {rv.distanceMiles !== null ? ` · ${formatDistance(rv.distanceMiles)}` : ""}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-semibold">{formatCurrency(rv.priceCents)}</span>
              <span className="text-xs text-muted-foreground">{rv.rvTypeLabel}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
