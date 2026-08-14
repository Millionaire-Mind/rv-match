"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { RvVideoThumb } from "@/components/rv/rv-video-thumb";
import { formatCurrency } from "@/lib/utils";
import { showMeSimilarRvs, toggleSaveInventory } from "@/server/discovery/actions";
import type { SavedCardData } from "@/server/inventory/saved";

export function SavedGrid({ initialItems }: { initialItems: SavedCardData[] }) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Only actually removes the card from the grid once the server confirms
  // the unsave persisted - a failed request must not make an RV silently
  // disappear from Saved while it's actually still saved server-side.
  function remove(inventoryId: string) {
    setRemovingId(inventoryId);
    setErrorId(null);
    startTransition(async () => {
      try {
        await toggleSaveInventory(inventoryId, false);
        setItems((prev) => prev.filter((i) => i.inventoryId !== inventoryId));
      } catch {
        setErrorId(inventoryId);
      } finally {
        setRemovingId(null);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <h2 className="text-lg font-semibold">No saved RVs yet</h2>
        <p className="max-w-sm text-muted-foreground">
          Tap the bookmark icon while browsing to save RVs you want to come back to.
        </p>
        <Button asChild variant="accent">
          <Link href="/discover">Start discovering</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.savedId} className="overflow-hidden rounded-xl border border-border bg-card">
          <RvVideoThumb
            videoUrl={item.videoUrl}
            photoUrl={item.photoUrl}
            alt={`${item.year} ${item.make} ${item.model}`}
            badges={
              <>
                {item.fitScore !== null && <Badge variant="accent">{item.fitScore}% Match</Badge>}
                {item.priceDrop && item.status !== "sold" && <Badge variant="accent">Price drop</Badge>}
              </>
            }
            overlay={
              <button
                type="button"
                onClick={() => remove(item.inventoryId)}
                aria-label="Remove from saved"
                disabled={removingId === item.inventoryId}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            }
            bottomOverlay={
              item.status === "sold" ? (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-xs font-medium text-white">
                  This RV has sold
                </div>
              ) : undefined
            }
          />
          <div className="p-3">
            <p className="font-medium leading-tight">
              {item.year} {item.make} {item.model}
            </p>
            <p className="text-sm text-muted-foreground">{item.dealerName}</p>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold">{formatCurrency(item.priceCents)}</span>
                {item.priceDrop && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatCurrency(item.priceDrop.oldPriceCents)}
                  </span>
                )}
              </div>
              {item.status === "sold" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startTransition(() => showMeSimilarRvs(item.inventoryId))}
                >
                  Find Similar
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/rv/${item.inventoryId}`}>View</Link>
                </Button>
              )}
            </div>
            {errorId === item.inventoryId && (
              <InlineError
                message="Couldn't remove this RV - try again."
                onRetry={() => remove(item.inventoryId)}
                retrying={removingId === item.inventoryId}
                className="mt-2"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
