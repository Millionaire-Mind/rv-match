"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";

/** Shown to the invite's owner while waiting for their partner to join - polls so the page moves to the shared-match view the moment the partner accepts, without a manual refresh. */
export function PartnerWaitingPanel({ token }: { token: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const relativePath = `/partner/${token}`;

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [router]);

  async function handleShare() {
    const url = `${window.location.origin}${relativePath}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Compare RV matches on ${brand.name}`, url });
      } catch {
        // user cancelled share sheet — not an error
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Waiting for your partner</h1>
      <p className="max-w-sm text-muted-foreground">
        Send them this link. Once they start swiping, you&apos;ll both see the RVs you match on.
      </p>
      <div className="w-full max-w-sm truncate rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground">
        {relativePath}
      </div>
      <Button variant="accent" onClick={handleShare}>
        <Share2 className="h-4 w-4" />
        {copied ? "Link copied" : "Share Invite Link"}
      </Button>
    </div>
  );
}
