"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createOrGetPartnerInviteLink } from "@/server/partner/actions";

/** Entry point for "Compare With My Partner" - creates (or reuses) the current consumer's invite link, then hands off to the /partner/[token] page, which shows the shareable link and polls for the partner joining. */
export function PartnerInviteButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const { token } = await createOrGetPartnerInviteLink();
        router.push(`/partner/${token}`);
      } catch {
        setError("Couldn't start a partner comparison right now. Please try again.");
      }
    });
  }

  return (
    <div>
      <Button variant="outline" onClick={handleClick} disabled={pending} className="w-full">
        <Heart className="h-4 w-4" />
        {pending ? "Setting up…" : "Compare With My Partner"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
