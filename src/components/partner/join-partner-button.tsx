"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { joinPartnerLink } from "@/server/partner/actions";

export function JoinPartnerButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await joinPartnerLink(token);
      if (result.ok) {
        router.push("/discover");
      } else {
        setError(result.error ?? "Couldn't join this invite.");
      }
    });
  }

  return (
    <div>
      <Button variant="accent" size="lg" onClick={handleClick} disabled={pending} className="w-full">
        {pending ? "Joining…" : "Start Matching Together"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
