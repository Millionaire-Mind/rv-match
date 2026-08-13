"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showMeSimilarRvs } from "@/server/discovery/actions";

/** Uses this RV as a preference input and sends the consumer into personalized discovery - the bridge back from a specific RV into the learning feed. */
export function ShowMeSimilarButton({ inventoryId }: { inventoryId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(() => showMeSimilarRvs(inventoryId))}
    >
      <Sparkles className="h-4 w-4" />
      {pending ? "Finding similar RVs…" : "Show Me Similar RVs"}
    </Button>
  );
}
