import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RvVideoThumb } from "@/components/rv/rv-video-thumb";
import { JoinPartnerButton } from "@/components/partner/join-partner-button";
import { PartnerWaitingPanel } from "@/components/partner/partner-waiting-panel";
import { getPartnerLinkView } from "@/server/partner/actions";
import { getSharedMatches } from "@/server/partner/shared-matches";
import { getDecisionsCount } from "@/server/recommendation/profile";
import { loadPlatformConfig } from "@/server/recommendation/config";
import { trackEvent } from "@/server/analytics/track";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { notifyPartnerMatchCompleteOnce } from "@/server/partner/notify-match-complete";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Compare With My Partner" };
export const dynamic = "force-dynamic";

interface PartnerPageProps {
  params: Promise<{ token: string }>;
}

export default async function PartnerPage({ params }: PartnerPageProps) {
  const { token } = await params;
  const link = await getPartnerLinkView(token);

  if (!link) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold">Invite not found</h1>
        <p className="max-w-sm text-muted-foreground">
          This invite link doesn&apos;t exist or has expired.
        </p>
        <Button asChild variant="accent">
          <Link href="/">Go home</Link>
        </Button>
      </main>
    );
  }

  if (link.viewerRole === "outsider") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold">This invite has already been used</h1>
        <p className="max-w-sm text-muted-foreground">
          Ask for a fresh invite link, or start your own RV search.
        </p>
        <Button asChild variant="accent">
          <Link href="/discover">Find My RV</Link>
        </Button>
      </main>
    );
  }

  if (link.viewerRole === "invitee") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold">You&apos;ve been invited to compare RV matches</h1>
        <p className="max-w-sm text-muted-foreground">
          Swipe through RVs on your own - your answers stay yours. Once you both have enough
          swipes in, we&apos;ll show you the RVs you both love.
        </p>
        <div className="w-full max-w-xs">
          <JoinPartnerButton token={token} />
        </div>
      </main>
    );
  }

  // From here, viewerRole is "owner" or "partner" - a party to this link.
  if (link.status === "pending") {
    return (
      <main className="min-h-dvh bg-background px-6">
        <PartnerWaitingPanel token={token} />
      </main>
    );
  }

  const ownerId = link.ownerConsumerProfileId!;
  const partnerId = link.partnerConsumerProfileId!;
  const viewerId = await getOrCreateConsumerProfileId();

  const [ownerDecisions, partnerDecisions, platformConfig] = await Promise.all([
    getDecisionsCount(ownerId),
    getDecisionsCount(partnerId),
    loadPlatformConfig(),
  ]);

  const threshold = platformConfig.matchCompleteThreshold;
  const bothReady = ownerDecisions >= threshold && partnerDecisions >= threshold;

  if (!bothReady) {
    const you = link.viewerRole === "owner" ? ownerDecisions : partnerDecisions;
    const them = link.viewerRole === "owner" ? partnerDecisions : ownerDecisions;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-2xl font-semibold">Almost there</h1>
        <p className="max-w-sm text-muted-foreground">
          Your shared match unlocks once you&apos;ve each made {threshold} swipes. You&apos;re at{" "}
          {you}, your partner is at {them}.
        </p>
        <div className="w-full max-w-xs">
          <Progress value={(Math.min(you, them) / threshold) * 100} />
        </div>
        <Button asChild variant="accent" size="lg">
          <Link href="/discover">Keep Swiping</Link>
        </Button>
      </main>
    );
  }

  await trackEvent({ consumerProfileId: viewerId, eventType: "shared_match_viewed" });
  await notifyPartnerMatchCompleteOnce(token, ownerId, partnerId);

  const sharedMatches = await getSharedMatches(ownerId, partnerId, 9);

  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/discover"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back to discovery"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Your Shared RV Match</h1>
      </div>

      {sharedMatches.length === 0 ? (
        <p className="text-muted-foreground">No published inventory available right now.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sharedMatches.map((card) => (
            <Link
              key={card.id}
              href={`/rv/${card.id}`}
              className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-accent"
            >
              <RvVideoThumb
                videoUrl={card.videoUrl}
                photoUrl={card.photoUrl}
                alt={`${card.year} ${card.make} ${card.model}`}
                badges={<Badge variant="accent">{card.sharedFitScore}% Shared Match</Badge>}
              />
              <div className="p-3">
                <p className="font-medium leading-tight">
                  {card.year} {card.make} {card.model}
                </p>
                <p className="mt-1 font-semibold">{formatCurrency(card.priceCents)}</p>
                {card.sharedExplanations[0] && (
                  <p className="mt-1 text-xs text-accent">{card.sharedExplanations[0]}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
