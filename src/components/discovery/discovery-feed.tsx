"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

import { DiscoveryCard } from "./discovery-card";
import { SwipeButtons } from "./swipe-buttons";
import { LocationPrompt } from "./location-prompt";
import type { DiscoveryCardDTO } from "@/server/discovery/dto";
import {
  fetchDiscoveryBatch,
  recordClientEvent,
  submitSwipeDecision,
  toggleSaveInventory,
} from "@/server/discovery/actions";

interface DiscoveryFeedProps {
  initialCards: DiscoveryCardDTO[];
  initialDecisionsCount: number;
  hasLocation: boolean;
  locationPromptThreshold: number;
  matchCompleteThreshold: number;
}

type Decision = "pass" | "like" | "love" | "more_like_this";

export function DiscoveryFeed({
  initialCards,
  initialDecisionsCount,
  hasLocation,
  locationPromptThreshold,
  matchCompleteThreshold,
}: DiscoveryFeedProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [decisionsCount, setDecisionsCount] = useState(initialDecisionsCount);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationKnown, setLocationKnown] = useState(hasLocation);
  const [learningToast, setLearningToast] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const swipeStartedAt = useRef<number>(0);
  const fetchingRef = useRef(false);
  const learningShown = useRef(false);

  useEffect(() => {
    swipeStartedAt.current = Date.now();
  }, [index]);

  const loadMore = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    try {
      const more = await fetchDiscoveryBatch(8);
      setCards((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        return [...prev, ...more.filter((c) => !existingIds.has(c.id))];
      });
    } finally {
      fetchingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (cards.length - index <= 3) {
      loadMore();
    }
  }, [index, cards.length, loadMore]);

  const currentCard = cards[index] ?? null;

  const advance = useCallback(
    (decision: Decision, card: DiscoveryCardDTO) => {
      const swipeDurationMs = Date.now() - swipeStartedAt.current;
      setIndex((i) => i + 1);

      submitSwipeDecision({
        inventoryId: card.id,
        decision,
        swipeDurationMs,
      })
        .then(({ decisionsCount: newCount }) => {
          setDecisionsCount(newCount);

          if (!learningShown.current && newCount >= 5) {
            learningShown.current = true;
            setLearningToast(true);
            setTimeout(() => setLearningToast(false), 3200);
          }

          if (!locationKnown && newCount >= locationPromptThreshold) {
            setLocationPromptOpen(true);
          }

          if (newCount >= matchCompleteThreshold) {
            router.push("/match");
          }
        })
        .catch(() => undefined);
    },
    [locationKnown, locationPromptThreshold, matchCompleteThreshold, router],
  );

  function handleDecision(decision: "pass" | "like" | "love") {
    if (!currentCard) return;
    advance(decision, currentCard);
  }

  function handleMoreLikeThis() {
    if (!currentCard) return;
    advance("more_like_this", currentCard);
  }

  function handleSave() {
    if (!currentCard) return;
    const isSaved = savedIds.has(currentCard.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(currentCard.id);
      else next.add(currentCard.id);
      return next;
    });
    toggleSaveInventory(currentCard.id, !isSaved).catch(() => undefined);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!currentCard) return;
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      switch (e.key) {
        case "ArrowLeft":
          handleDecision("pass");
          break;
        case "ArrowRight":
          handleDecision("like");
          break;
        case "ArrowUp":
          handleDecision("love");
          break;
        case "m":
        case "M":
          handleMoreLikeThis();
          break;
        case "s":
        case "S":
          handleSave();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard, savedIds]);

  function handleMilestone(
    milestone: "started" | "25" | "50" | "75" | "complete" | "replayed",
  ) {
    if (!currentCard) return;
    const eventType =
      milestone === "started"
        ? "video_started"
        : milestone === "complete"
          ? "video_complete"
          : milestone === "replayed"
            ? "video_replayed"
            : (`video_${milestone}` as const);
    recordClientEvent(eventType, currentCard.id).catch(() => undefined);
  }

  if (!currentCard) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        {loadingMore ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-muted-foreground">Finding more RVs for you…</p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">No more RVs right now</h2>
            <p className="max-w-sm text-muted-foreground">
              You&apos;ve seen everything available in your area. Check your saved RVs or widen your
              search radius from Match Results.
            </p>
          </>
        )}
      </div>
    );
  }

  const progressTarget = locationKnown ? matchCompleteThreshold : locationPromptThreshold;

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{
              width: `${Math.min(100, (decisionsCount / progressTarget) * 100)}%`,
            }}
          />
        </div>
        <span className="text-xs font-medium text-white drop-shadow">{decisionsCount}</span>
      </div>

      {learningToast && (
        <div className="absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg">
          We&apos;re learning what you like…
        </div>
      )}

      <div className="relative h-full w-full">
        <AnimatePresence>
          {cards.slice(index, index + 2).map((card, i) => (
            <DiscoveryCard
              key={card.id}
              card={card}
              active={i === 0}
              onDecision={(decision) => advance(decision, card)}
              onMilestone={handleMilestone}
            />
          ))}
        </AnimatePresence>
      </div>

      <SwipeButtons
        onPass={() => handleDecision("pass")}
        onLike={() => handleDecision("like")}
        onLove={() => handleDecision("love")}
        onMoreLikeThis={handleMoreLikeThis}
        onSave={handleSave}
        saved={savedIds.has(currentCard.id)}
      />

      <LocationPrompt
        open={locationPromptOpen}
        onOpenChange={setLocationPromptOpen}
        onSaved={() => setLocationKnown(true)}
      />
    </div>
  );
}
