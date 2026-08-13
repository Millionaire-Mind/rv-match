"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PlayCircle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { showMeSimilarRvs, toggleSaveInventory } from "@/server/discovery/actions";
import type { SavedCardData } from "@/server/inventory/saved";

export function SavedGrid({ initialItems }: { initialItems: SavedCardData[] }) {
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();

  function remove(inventoryId: string) {
    setItems((prev) => prev.filter((i) => i.inventoryId !== inventoryId));
    startTransition(async () => {
      await toggleSaveInventory(inventoryId, false);
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
          <div className="relative aspect-video bg-secondary">
            {item.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
            )}
            {item.hasVideo && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                <PlayCircle className="h-12 w-12 text-white drop-shadow" strokeWidth={1.5} />
              </div>
            )}
            <button
              type="button"
              onClick={() => remove(item.inventoryId)}
              aria-label="Remove from saved"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
            {item.status === "sold" && (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-xs font-medium text-white">
                This RV has sold
              </div>
            )}
            {item.fitScore !== null && (
              <Badge variant="accent" className="absolute left-2 top-2">
                {item.fitScore}% Match
              </Badge>
            )}
          </div>
          <div className="p-3">
            <p className="font-medium leading-tight">
              {item.year} {item.make} {item.model}
            </p>
            <p className="text-sm text-muted-foreground">{item.dealerName}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-semibold">{formatCurrency(item.priceCents)}</span>
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
          </div>
        </div>
      ))}
    </div>
  );
}
