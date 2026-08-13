import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getSavedInventory } from "@/server/inventory/saved";
import { SavedGrid } from "@/components/saved/saved-grid";

export const metadata: Metadata = { title: "Saved RVs" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const items = await getSavedInventory();

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
        <h1 className="text-xl font-semibold">Saved RVs</h1>
      </div>
      <SavedGrid initialItems={items} />
    </main>
  );
}
