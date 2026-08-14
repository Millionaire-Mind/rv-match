"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { submitSwipeDecision } from "@/server/discovery/actions";

type Reaction = "love" | "like" | "pass";

const REACTIONS: { value: Reaction; label: string; variant: "accent" | "outline" }[] = [
  { value: "love", label: "Yes, I'd buy this", variant: "accent" },
  { value: "like", label: "Maybe", variant: "outline" },
  { value: "pass", label: "Not for me", variant: "outline" },
];

/**
 * Records the reaction via the same submitSwipeDecision path the swipe
 * feed uses - a real preference signal (and a real decision toward the
 * ZIP-prompt/Match-unlock thresholds), not a throwaway poll. Follows the
 * same pending -> persist -> success/error pattern as the swipe feed
 * (Gap 1): nothing is shown as "done" until the server confirms it.
 */
export function ReactionPanel({ inventoryId, rvDetailHref }: { inventoryId: string; rvDetailHref: string }) {
  const [reacted, setReacted] = useState<Reaction | null>(null);
  const [pending, setPending] = useState(false);
  const [errorReaction, setErrorReaction] = useState<Reaction | null>(null);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const react = useCallback(
    async (decision: Reaction) => {
      if (pending) return;
      setPending(true);
      setErrorReaction(null);
      try {
        await submitSwipeDecision({
          inventoryId,
          decision,
          swipeDurationMs: startedAt.current ? Date.now() - startedAt.current : null,
        });
        setReacted(decision);
      } catch {
        setErrorReaction(decision);
      } finally {
        setPending(false);
      }
    },
    [inventoryId, pending],
  );

  if (reacted) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-4 text-center">
        <p className="font-medium">Thanks - we&apos;ll use that to find RVs you&apos;ll love.</p>
        <Button asChild variant="accent" size="lg" className="mt-3 w-full">
          <Link href="/discover">Find My RV</Link>
        </Button>
        <Link href={rvDetailHref} className="mt-3 inline-block text-sm text-muted-foreground underline">
          See full details
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-2">
      {REACTIONS.map((r) => (
        <Button
          key={r.value}
          variant={r.variant}
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => react(r.value)}
        >
          {r.label}
        </Button>
      ))}
      {errorReaction && (
        <InlineError
          message="Couldn't save your reaction - try again."
          onRetry={() => react(errorReaction)}
          retrying={pending}
        />
      )}
    </div>
  );
}
