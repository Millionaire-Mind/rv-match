import Link from "next/link";

import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-muted-foreground">
        This page doesn&apos;t exist or may have moved. Head back to {brand.name} to keep browsing.
      </p>
      <Button asChild variant="accent">
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
