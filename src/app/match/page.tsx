import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, PlayCircle } from "lucide-react";
import { and, eq } from "drizzle-orm";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadiusSelect } from "@/components/match/radius-select";
import { LocationPromptInline } from "@/components/discovery/location-prompt-inline";
import { PartnerInviteButton } from "@/components/partner/partner-invite-button";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { getConsumerLocationState } from "@/server/discovery/location";
import { getBehaviorSnapshot, getDecisionsCount } from "@/server/recommendation/profile";
import { getTopMatches } from "@/server/recommendation/top-matches";
import { hydrateScoredInventory } from "@/server/discovery/hydrate";
import { loadPlatformConfig } from "@/server/recommendation/config";
import { trackEvent } from "@/server/analytics/track";
import { db } from "@/server/db/client";
import { behavioralEvents } from "@/server/db/schema";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Your RV Match" };
export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const [decisionsCount, locationState, platformConfig] = await Promise.all([
    getDecisionsCount(consumerProfileId),
    getConsumerLocationState(),
    loadPlatformConfig(),
  ]);

  if (decisionsCount < platformConfig.matchCompleteThreshold) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold">Your RV Match isn&apos;t ready yet</h1>
        <p className="max-w-sm text-muted-foreground">
          Keep swiping — your match unlocks after {platformConfig.matchCompleteThreshold} decisions.
          You&apos;re at {decisionsCount}.
        </p>
        <div className="w-full max-w-xs">
          <Progress value={(decisionsCount / platformConfig.matchCompleteThreshold) * 100} />
        </div>
        <Button asChild variant="accent" size="lg">
          <Link href="/discover">Keep Swiping</Link>
        </Button>
      </main>
    );
  }

  const [alreadyLogged] = await db
    .select({ id: behavioralEvents.id })
    .from(behavioralEvents)
    .where(
      and(
        eq(behavioralEvents.consumerProfileId, consumerProfileId),
        eq(behavioralEvents.eventType, "match_completed"),
      ),
    )
    .limit(1);
  if (!alreadyLogged) {
    await trackEvent({ consumerProfileId, eventType: "match_completed" });
  }

  const [snapshot, topScored] = await Promise.all([
    getBehaviorSnapshot(consumerProfileId),
    getTopMatches(consumerProfileId, 9),
  ]);
  const topMatches = await hydrateScoredInventory(topScored);

  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/discover"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
            aria-label="Back to discovery"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Your RV Match</h1>
        </div>
        <RadiusSelect initialRadius={locationState.radiusMiles} />
      </div>

      {!locationState.hasLocation && <LocationPromptInline />}

      <div className="mb-6">
        <PartnerInviteButton />
      </div>

      <section className="mb-8 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Based on {snapshot.rvsViewed} RVs you&apos;ve reacted to, here&apos;s what we&apos;ve learned.
          These are normalized preference scores from your behavior, not statistical probabilities.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Viewed" value={snapshot.rvsViewed} />
          <Stat label="Liked" value={snapshot.likes} />
          <Stat label="Loved" value={snapshot.loves} />
          <Stat label="Saved" value={snapshot.saves} />
        </div>

        {snapshot.topPreferences.length > 0 && (
          <div className="mt-5 space-y-3">
            {snapshot.topPreferences.map((p) => (
              <div key={`${p.attribute}-${p.value}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-muted-foreground">{p.strength}%</span>
                </div>
                <Progress value={p.strength} className="mt-1 h-1.5" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Top matching RVs available now</h2>
        {topMatches.length === 0 ? (
          <p className="text-muted-foreground">No published inventory available right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topMatches.map((card) => (
              <Link
                key={card.id}
                href={`/rv/${card.id}`}
                className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent"
              >
                <div className="relative aspect-video bg-secondary">
                  {card.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.photos[0]} alt="" className="h-full w-full object-cover" />
                  )}
                  {/* Every match is video-eligible (see discoveryEligible()) - this
                      is a static preview frame, not a substitute for the real
                      video, which plays on the RV detail page this card links to. */}
                  {card.videoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
                      <PlayCircle className="h-12 w-12 text-white drop-shadow" strokeWidth={1.5} />
                    </div>
                  )}
                  <Badge variant="accent" className="absolute left-2 top-2">
                    {card.fitScore}% Match
                  </Badge>
                </div>
                <div className="p-3">
                  <p className="font-medium leading-tight">
                    {card.year} {card.make} {card.model}
                  </p>
                  <p className="text-sm text-muted-foreground">{card.dealerName}</p>
                  <p className="mt-1 font-semibold">{formatCurrency(card.priceCents)}</p>
                  {card.explanations[0] && (
                    <p className="mt-1 text-xs text-accent">{card.explanations[0]}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary p-3 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
