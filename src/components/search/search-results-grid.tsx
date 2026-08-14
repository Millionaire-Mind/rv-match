import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { RvVideoThumb } from "@/components/rv/rv-video-thumb";
import { formatCurrency, formatDistance, formatRvTitle } from "@/lib/utils";
import type { SearchResultCard } from "@/server/search/query";

/**
 * Every result here is discoveryEligible() (see searchInventory) - video-first
 * is enforced for traditional search results too, not just the swipe feed and
 * Match, via the shared RvVideoThumb tile (vertical, autoplays muted when
 * scrolled into view) rather than a static landscape photo grid.
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
          <RvVideoThumb
            videoUrl={rv.videoUrl}
            photoUrl={rv.photoUrl}
            alt={formatRvTitle(rv)}
            badges={
              <Badge variant={rv.condition === "new" ? "accent" : "secondary"}>
                {rv.condition === "new" ? "New" : "Used"}
              </Badge>
            }
          />
          <div className="p-3">
            <p className="font-medium leading-tight">{formatRvTitle(rv)}</p>
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
