"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitZipCode } from "@/server/discovery/location";
import { UseMyLocationButton } from "@/components/discovery/use-my-location-button";

export function LocationPromptInline() {
  const router = useRouter();
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitZipCode(zip);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mb-6 space-y-3 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <MapPin className="h-5 w-5 shrink-0 text-accent" />
        <p className="mr-auto min-w-[200px] text-sm">
          Add your ZIP code to see RVs you can actually buy near you.
        </p>
        <Input
          inputMode="numeric"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
          placeholder="ZIP code"
          className="w-28"
        />
        <Button type="submit" variant="accent" disabled={pending || zip.length !== 5}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </form>
      <div className="flex items-center gap-3 pl-8">
        <span className="text-xs text-muted-foreground">or</span>
        <UseMyLocationButton onSuccess={() => router.refresh()} />
      </div>
    </div>
  );
}
