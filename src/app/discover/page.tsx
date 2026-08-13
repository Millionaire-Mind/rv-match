import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";

import { DiscoveryFeed } from "@/components/discovery/discovery-feed";
import { fetchDiscoveryBatch, startDiscoverySession } from "@/server/discovery/actions";
import { getConsumerLocationState } from "@/server/discovery/location";
import { loadPlatformConfig } from "@/server/recommendation/config";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Discover RVs" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  await startDiscoverySession();

  const [cards, locationState, platformConfig] = await Promise.all([
    fetchDiscoveryBatch(8),
    getConsumerLocationState(),
    loadPlatformConfig(),
  ]);

  return (
    <main className="fixed inset-0 flex flex-col bg-black">
      <header className="safe-top z-30 flex items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          aria-label={`Back to ${brand.name} home`}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Link
          href="/saved"
          className="flex h-9 items-center gap-1.5 rounded-full bg-black/40 px-3 text-sm font-medium text-white backdrop-blur-sm"
        >
          <Search className="h-4 w-4" />
          Saved
        </Link>
      </header>
      <div className="relative min-h-0 flex-1 px-2 pb-2 safe-bottom sm:px-4 sm:pb-4">
        {cards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-white">
            <h2 className="text-xl font-semibold">No RVs available yet</h2>
            <p className="max-w-sm text-white/70">
              This demo instance has no published inventory yet. Ask a dealer admin to publish
              some RVs, or run the seed script.
            </p>
          </div>
        ) : (
          <DiscoveryFeed
            initialCards={cards}
            initialDecisionsCount={locationState.decisionsCount}
            hasLocation={locationState.hasLocation}
            locationPromptThreshold={platformConfig.locationPromptThreshold}
            matchCompleteThreshold={platformConfig.matchCompleteThreshold}
          />
        )}
      </div>
    </main>
  );
}
