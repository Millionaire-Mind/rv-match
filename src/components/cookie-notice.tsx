"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "rvm_cookie_notice_dismissed";

/**
 * A one-time, first-party-only disclosure - this platform uses a single
 * session cookie (no third-party ad/tracking cookies), so this is a simple
 * notice, not a consent-gate that blocks the site until answered. Visible
 * by default (a fresh visitor with nothing in localStorage should see it);
 * a returning visitor who already dismissed it gets it hidden via a direct
 * DOM mutation right after mount, rather than React state, so dismissal
 * never depends on a render triggered from inside an effect.
 */
export function CookieNotice() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) ref.current?.setAttribute("hidden", "");
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    ref.current?.setAttribute("hidden", "");
  }

  return (
    <div
      ref={ref}
      className="fixed bottom-4 left-4 right-4 z-50 max-w-sm rounded-xl border border-border bg-card px-4 py-3 shadow-lg sm:left-auto"
    >
      <div className="flex flex-col items-start gap-3">
        <p className="text-xs text-muted-foreground">
          We use one first-party cookie to remember your matches and preferences - no third-party trackers. See our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
        <Button size="sm" variant="outline" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
