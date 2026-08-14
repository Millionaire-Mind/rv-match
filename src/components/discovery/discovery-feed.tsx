"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

import { DiscoveryCard, type DiscoveryCardHandle } from "./discovery-card";
import { SwipeButtons } from "./swipe-buttons";
import { LocationPrompt } from "./location-prompt";
import { InlineError } from "@/components/ui/inline-error";
import { videoMilestoneToEventType, type VideoMilestone, type VideoWatchProgress } from "./video-player";
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
  // A swipe decision is "pending" from the moment the user acts until the
  // server has confirmed it persisted - the feed must not treat it as done
  // (advance permanently, count it toward thresholds) before that. See
  // `advance` below.
  const [pendingSwipe, setPendingSwipe] = useState<{ cardId: string; decision: Decision } | null>(null);
  const [swipeError, setSwipeError] = useState<{ card: DiscoveryCardDTO; decision: Decision } | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<{ inventoryId: string; nextSaved: boolean } | null>(null);
  const swipeStartedAt = useRef<number>(0);
  const fetchingRef = useRef(false);
  const learningShown = useRef(false);
  const indexRef = useRef(0);
  // Synchronous guard against a second swipe submission starting before the
  // first one's promise has resolved (double-click, a keypress racing a
  // click, React re-render) - state updates are not synchronous enough on
  // their own to prevent a second `advance()` call in the same tick.
  const swipeInFlightRef = useRef(false);
  const activeCardRef = useRef<DiscoveryCardHandle>(null);

  useEffect(() => {
    swipeStartedAt.current = Date.now();
  }, [index]);

  // Always-current index for async callbacks (fetch responses, etc.) that
  // shouldn't act on a value captured back when they were kicked off - see
  // handleMoreLikeThis, which needs to know how many swipes have happened
  // by the time its re-rank fetch resolves, not how many had happened when
  // it started.
  useEffect(() => {
    indexRef.current = index;
  });

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

  /**
   * user action -> pending state -> persistence -> success -> advance UI.
   * The exit animation plays immediately (feels fast), but `index` - which
   * is what actually removes the card and counts the decision toward the
   * ZIP-prompt/Match-unlock thresholds - only moves forward once the
   * server has confirmed the swipe persisted. On failure the card's exit
   * animation is rolled back (`resetPosition`) and a recoverable error with
   * a Retry is shown instead of silently pretending the swipe worked.
   * `swipeInFlightRef` prevents a second submission (double-click, retry
   * racing a keypress) from starting before the first resolves; the server
   * side (`submitSwipeDecision`) is additionally idempotent against an
   * identical resubmission, so a retry after a failed *request* (as
   * opposed to a request that succeeded but whose response was lost) can
   * never double-count the decision.
   */
  const advance = useCallback(
    async (decision: Decision, card: DiscoveryCardDTO) => {
      if (swipeInFlightRef.current) return;
      swipeInFlightRef.current = true;
      setPendingSwipe({ cardId: card.id, decision });
      setSwipeError(null);
      activeCardRef.current?.playExit(decision);

      const swipeDurationMs = Date.now() - swipeStartedAt.current;

      try {
        const { decisionsCount: newCount } = await submitSwipeDecision({
          inventoryId: card.id,
          decision,
          swipeDurationMs,
        });

        setIndex((i) => i + 1);
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
        } else if (decision === "more_like_this") {
          // MORE LIKE THIS is meant to change the *next* recommendations
          // the consumer sees, not just a future prefetch batch several
          // swipes away - re-fetch now that the preference update above
          // has been persisted, and splice the fresh (already
          // preference-aware, already-swiped-exclusion-aware) results in
          // behind whatever card is currently on screen. Reading
          // indexRef.current here (rather than closing over `index`)
          // means this still does the right thing even if the consumer
          // swiped again before this fetch resolved - it only ever
          // replaces cards genuinely not yet shown, never the one
          // currently in front of them.
          try {
            const fresh = await fetchDiscoveryBatch(8);
            setCards((prev) => {
              const keepThrough = indexRef.current + 1; // current card on screen stays stable
              const stable = prev.slice(0, keepThrough);
              const stableIds = new Set(stable.map((c) => c.id));
              const freshUnseen = fresh.filter((c) => !stableIds.has(c.id));
              return [...stable, ...freshUnseen];
            });
          } catch {
            // Keep whatever was already queued if the re-fetch fails - the
            // preference update itself already succeeded and will still
            // show up in the next real prefetch.
          }
        }
      } catch {
        setSwipeError({ card, decision });
        activeCardRef.current?.resetPosition();
      } finally {
        swipeInFlightRef.current = false;
        setPendingSwipe(null);
      }
    },
    [locationKnown, locationPromptThreshold, matchCompleteThreshold, router],
  );

  function handleDecision(decision: "pass" | "like" | "love") {
    if (!currentCard || pendingSwipe) return;
    advance(decision, currentCard);
  }

  function handleMoreLikeThis() {
    if (!currentCard || pendingSwipe) return;
    advance("more_like_this", currentCard);
  }

  function retrySwipe() {
    if (!swipeError) return;
    advance(swipeError.decision, swipeError.card);
  }

  /**
   * Save/unsave never flips `savedIds` until `toggleSaveInventory` actually
   * succeeds - unlike the swipe animation, there's no snappy motion tied to
   * this action that needs an optimistic head start, so it's simplest and
   * safest to only ever represent a state the server has confirmed. On
   * failure the bookmark icon stays exactly as it was and a retry is
   * offered. `savePending` blocks a second toggle from firing mid-request.
   */
  const performSave = useCallback(async (inventoryId: string, nextSaved: boolean) => {
    setSavePending(true);
    setSaveError(null);
    try {
      await toggleSaveInventory(inventoryId, nextSaved);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (nextSaved) next.add(inventoryId);
        else next.delete(inventoryId);
        return next;
      });
    } catch {
      setSaveError({ inventoryId, nextSaved });
    } finally {
      setSavePending(false);
    }
  }, []);

  function handleSave() {
    if (!currentCard || savePending) return;
    performSave(currentCard.id, !savedIds.has(currentCard.id));
  }

  function retrySave() {
    if (!saveError || savePending) return;
    performSave(saveError.inventoryId, saveError.nextSaved);
  }

  // The keydown listener is attached once (see the effect below with an
  // empty dependency array) rather than re-subscribed on every state
  // change. Handlers close over component state that changes on every
  // swipe (currentCard, locationKnown, etc.), so a naive effect keyed on
  // "the state it uses" either re-subscribes constantly or — if a
  // dependency is missed — silently keeps calling a stale closure (e.g.
  // still thinking locationKnown=false after the ZIP prompt was saved,
  // endlessly re-opening it). Routing every keypress through a ref that's
  // updated on every render sidesteps both problems.
  const latestHandlers = useRef({ handleDecision, handleMoreLikeThis, handleSave, currentCard });
  useEffect(() => {
    latestHandlers.current = { handleDecision, handleMoreLikeThis, handleSave, currentCard };
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const { handleDecision, handleMoreLikeThis, handleSave, currentCard } = latestHandlers.current;
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
  }, []);

  function handleMilestone(milestone: VideoMilestone, progress?: VideoWatchProgress) {
    if (!currentCard) return;
    recordClientEvent(videoMilestoneToEventType(milestone), currentCard.id, progress && { ...progress }).catch(
      () => undefined,
    );
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
              ref={i === 0 ? activeCardRef : undefined}
              card={card}
              active={i === 0}
              onDecision={(decision) => advance(decision, card)}
              onMilestone={handleMilestone}
            />
          ))}
        </AnimatePresence>
      </div>

      {(swipeError || saveError) && (
        <div className="absolute inset-x-4 bottom-28 z-30 flex flex-col gap-2 sm:bottom-32">
          {swipeError && (
            <InlineError
              message="That didn't save - your last swipe wasn't recorded."
              onRetry={retrySwipe}
              retrying={!!pendingSwipe}
            />
          )}
          {saveError && (
            <InlineError
              message={
                saveError.nextSaved ? "Couldn't save this RV - try again." : "Couldn't remove this RV from Saved."
              }
              onRetry={retrySave}
              retrying={savePending}
            />
          )}
        </div>
      )}

      <SwipeButtons
        onPass={() => handleDecision("pass")}
        onLike={() => handleDecision("like")}
        onLove={() => handleDecision("love")}
        onMoreLikeThis={handleMoreLikeThis}
        onSave={handleSave}
        saved={savedIds.has(currentCard.id)}
        disabled={!!pendingSwipe || savePending}
      />

      <LocationPrompt
        open={locationPromptOpen}
        onOpenChange={setLocationPromptOpen}
        onSaved={() => setLocationKnown(true)}
      />
    </div>
  );
}
