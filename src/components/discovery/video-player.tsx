"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  src: string | null;
  poster: string | null;
  captionSrc?: string | null;
  active: boolean;
  className?: string;
  onMilestone?: (milestone: "started" | "25" | "50" | "75" | "complete" | "replayed") => void;
}

export function VideoPlayer({ src, poster, captionSrc, active, className, onMilestone }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const milestonesFired = useRef(new Set<string>());
  const hasCompletedOnce = useRef(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (active) {
      video.currentTime = 0;
      milestonesFired.current.clear();
      hasCompletedOnce.current = false;
      hasStarted.current = false;
      video.play().catch(() => {
        // Autoplay can be blocked; the visible mute/play affordance covers this.
      });
    } else {
      video.pause();
    }
  }, [active, src]);

  useEffect(() => {
    const track = trackRef.current?.track;
    if (!track) return;
    track.mode = captionsOn && captionSrc ? "showing" : "hidden";
  }, [captionsOn, captionSrc]);

  function fireOnce(key: string, milestone: Parameters<NonNullable<typeof onMilestone>>[0]) {
    if (milestonesFired.current.has(key)) return;
    milestonesFired.current.add(key);
    onMilestone?.(milestone);
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    if (!hasStarted.current) {
      hasStarted.current = true;
      fireOnce("started", "started");
    }
    const pct = video.currentTime / video.duration;
    if (pct >= 0.25) fireOnce("25", "25");
    if (pct >= 0.5) fireOnce("50", "50");
    if (pct >= 0.75) fireOnce("75", "75");
  }

  function handleEnded() {
    if (!hasCompletedOnce.current) {
      hasCompletedOnce.current = true;
      fireOnce("complete", "complete");
    } else {
      onMilestone?.("replayed");
    }
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => undefined);
    }
  }

  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-secondary", className)}>
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-muted-foreground text-sm">No media available</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative bg-black", className)}>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        playsInline
        loop={false}
        preload={active ? "auto" : "metadata"}
        className="h-full w-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      >
        {captionSrc && (
          <track ref={trackRef} kind="captions" src={captionSrc} srcLang="en" label="English" default />
        )}
      </video>
      {captionSrc && (
        <button
          type="button"
          onClick={() => setCaptionsOn((c) => !c)}
          aria-label={captionsOn ? "Turn off captions" : "Turn on captions"}
          aria-pressed={captionsOn}
          className="absolute right-4 top-16 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          {captionsOn ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute video" : "Mute video"}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
    </div>
  );
}
