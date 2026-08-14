"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side errors have no server log to land in - this is the one
    // place they're at least visible somewhere (browser devtools / any
    // error-monitoring script already loaded on the page), rather than
    // silently showing a blank screen.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-muted-foreground">
        {brand.name} ran into an unexpected error. Try again, or head back and pick up where you left off.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="accent">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
