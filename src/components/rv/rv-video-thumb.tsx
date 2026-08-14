"use client";

import { useEffect, useRef, useState } from "react";
import { PlayCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface RvVideoThumbProps {
  videoUrl: string | null;
  photoUrl: string | null;
  alt?: string;
  /** Absolutely positioned, top-left - typically match/condition badges. */
  badges?: React.ReactNode;
  /** Absolutely positioned, top-right - typically a per-card action button. */
  overlay?: React.ReactNode;
  /** Absolutely positioned along the bottom edge - e.g. a "sold" bar. */
  bottomOverlay?: React.ReactNode;
  className?: string;
}

/**
 * The shared vertical-video-first tile used everywhere an RV is shown as a
 * card outside the main swipe feed (Search, Match, Saved, Partner Shared
 * Match) - these surfaces previously degraded into landscape photo grids
 * with a static play icon, which is what this replaces. Every eligible RV
 * always has a video (see discoveryEligible()); the video only actually
 * autoplays (muted, looped) once a meaningful portion of the tile is
 * scrolled into view, and pauses again once it leaves - a grid of many
 * tiles must not play every video at once. `prefers-reduced-motion` and a
 * missing IntersectionObserver both fall back to a static poster frame
 * with a play icon rather than autoplaying.
 */
export function RvVideoThumb({ videoUrl, photoUrl, alt = "", badges, overlay, bottomOverlay, className }: RvVideoThumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  // Lazy initializer rather than an effect - `inView` is always false on
  // the very first render in both server and client environments, so
  // `showPlayIcon` below never actually depends on this value until after
  // mount, when IntersectionObserver can update `inView`. That means this
  // can safely differ between the server pass and the client's first
  // render without causing a hydration mismatch.
  const [canAutoplay] = useState(
    () => typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !videoUrl || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.6,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView && canAutoplay) {
      video.currentTime = 0;
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [inView, canAutoplay]);

  const showPlayIcon = !!videoUrl && !(inView && canAutoplay);

  return (
    <div
      ref={containerRef}
      className={cn("relative aspect-[9/16] max-h-80 w-full overflow-hidden bg-black", className)}
    >
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          poster={photoUrl ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={alt}
          className="h-full w-full object-cover"
        />
      ) : photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          No media available
        </div>
      )}
      {showPlayIcon && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
          <PlayCircle className="h-10 w-10 text-white drop-shadow" strokeWidth={1.5} />
        </div>
      )}
      {badges && <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">{badges}</div>}
      {overlay && <div className="absolute right-2 top-2">{overlay}</div>}
      {bottomOverlay}
    </div>
  );
}
