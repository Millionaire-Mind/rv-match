"use client";

import { useState } from "react";
import { LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { submitGeolocation } from "@/server/discovery/location";
import { cn } from "@/lib/utils";

type Status = "idle" | "pending" | "denied" | "unavailable";

/**
 * Gap 8: optional browser geolocation alongside ZIP entry - never a
 * replacement for it. Denial, an unsupported browser, and a timeout all
 * fall back the same low-key way: a muted note, not an alarming error,
 * because the ZIP field this button sits next to is already a complete
 * path forward on its own.
 */
export function UseMyLocationButton({ onSuccess, className }: { onSuccess: () => void; className?: string }) {
  const [status, setStatus] = useState<Status>("idle");

  function handleClick() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void submitGeolocation(position.coords.latitude, position.coords.longitude).then(() => {
          setStatus("idle");
          onSuccess();
        });
      },
      () => {
        // PERMISSION_DENIED, POSITION_UNAVAILABLE, and TIMEOUT are all
        // treated identically - the consumer already has the ZIP field
        // right here, so there's nothing more specific to tell them.
        setStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={status === "pending"}>
        <LocateFixed className="mr-1.5 h-4 w-4" />
        {status === "pending" ? "Finding you…" : "Use my location"}
      </Button>
      {status === "denied" && (
        <p className="text-xs text-muted-foreground">
          We couldn&apos;t access your location. No problem — just enter your ZIP code below.
        </p>
      )}
      {status === "unavailable" && (
        <p className="text-xs text-muted-foreground">
          Location isn&apos;t available in this browser — enter your ZIP code below instead.
        </p>
      )}
    </div>
  );
}
