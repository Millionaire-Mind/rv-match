import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { SearchFiltersForm } from "@/components/search/search-filters-form";
import { SearchResultsGrid } from "@/components/search/search-results-grid";
import { searchInventory } from "@/server/search/query";
import { parseSearchParams } from "@/server/validation/search";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { trackEvent } from "@/server/analytics/track";

export const metadata: Metadata = { title: "Search RVs" };
export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawParams = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = parseSearchParams(urlParams);
  const hasFilters = urlParams.size > 0;

  const [{ totalCount, results }, consumerProfileId] = await Promise.all([
    searchInventory(filters),
    getOrCreateConsumerProfileId(),
  ]);

  if (hasFilters) {
    await trackEvent({
      consumerProfileId,
      eventType: "search_performed",
      metadata: { filters, resultCount: totalCount },
    });
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back home"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">I Know What I Want</h1>
      </div>

      <div className="mb-6">
        <SearchFiltersForm />
      </div>

      <div className="mb-3 text-sm text-muted-foreground">
        {totalCount} {totalCount === 1 ? "RV" : "RVs"} found
      </div>
      <SearchResultsGrid results={results} />
    </main>
  );
}
