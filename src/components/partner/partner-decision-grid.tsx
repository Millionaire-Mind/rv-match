import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { RvVideoThumb } from "@/components/rv/rv-video-thumb";
import { formatCurrency } from "@/lib/utils";
import type { PartnerDecisionCard, SwipeDecisionValue } from "@/server/partner/decision-comparison";

const DECISION_LABELS: Record<SwipeDecisionValue, string> = {
  pass: "Passed",
  like: "Liked",
  love: "Loved",
  more_like_this: "Loved the vibe",
};

/**
 * Renders one of the three swipe-based comparison buckets (both loved,
 * both liked, disagreed) - same card shape for all three so "where you
 * disagreed" reads as informational, not as a scoreboard. Each card shows
 * both partners' actual decisions plainly rather than a single blended
 * label.
 */
export function PartnerDecisionGrid({
  title,
  description,
  cards,
  ownerLabel,
  partnerLabel,
}: {
  title: string;
  description?: string;
  cards: PartnerDecisionCard[];
  ownerLabel: string;
  partnerLabel: string;
}) {
  if (cards.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/rv/${card.id}`}
            className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent"
          >
            <RvVideoThumb
              videoUrl={card.videoUrl}
              photoUrl={card.photoUrl}
              alt={`${card.year} ${card.make} ${card.model}`}
            />
            <div className="p-3">
              <p className="font-medium leading-tight">
                {card.year} {card.make} {card.model}
              </p>
              <p className="mt-1 font-semibold">{formatCurrency(card.priceCents)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <Badge variant="secondary">
                  {ownerLabel}: {DECISION_LABELS[card.ownerDecision]}
                </Badge>
                <Badge variant="secondary">
                  {partnerLabel}: {DECISION_LABELS[card.partnerDecision]}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
