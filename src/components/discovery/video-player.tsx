"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Play, Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

export type VideoMilestone =
  | "started"
  | "25"
  | "50"
  | "75"
  | "complete"
  | "replayed"
  | "paused"
  | "muted"
  | "unmuted";
export interface VideoWatchProgress {
  secondsWatched: number;
  percentWatched: number;
}

/** Maps a player milestone to its behavioral_events event type - the one place this mapping is defined, used by every VideoPlayer consumer. */
export function videoMilestoneToEventType(
  milestone: VideoMilestone,
):
  | "video_started"
  | "video_25"
  | "video_50"
  | "video_75"
  | "video_complete"
  | "video_replayed"
  | "video_paused"
  | "video_muted"
  | "video_unmuted" {
  switch (milestone) {
    case "started":
      return "video_started";
    case "complete":
      return "video_complete";
    case "replayed":
      return "video_replayed";
    case "paused":
      return "video_paused";
    case "muted":
      return "video_muted";
    case "unmuted":
      return "video_unmuted";
    default:
      return `video_${milestone}`;
  }
}

interface VideoPlayerProps {
  src: string | null;
  poster: string | null;
  captionSrc?: string | null;
  active: boolean;
  className?: string;
  onMilestone?: (milestone: VideoMilestone, progress?: VideoWatchProgress) => void;
  /**
   * Adds a tap-to-pause overlay. Off by default: the discovery feed wraps
   * this component in a framer-motion drag-to-swipe gesture, and a
   * full-cover tap target risks swallowing/conflicting with that drag
   * gesture. Safe to enable wherever the player isn't inside a swipeable
   * card (e.g. the RV detail page).
   */
  allowTapToPause?: boolean;
}

export function VideoPlayer({
  src,
  poster,
  captionSrc,
  active,
  className,
  onMilestone,
  allowTapToPause = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const milestonesFired = useRef(new Set<string>());
  const hasCompletedOnce = useRef(false);
  const hasStarted = useRef(false);
  const [userPaused, setUserPaused] = useState(false);
  // Distinguishes a genuine tap-to-pause from the programmatic pause() this
  // component calls when a card is swiped away - only the former is a real
  // "the consumer paused" signal worth tracking.
  const pauseIsProgrammatic = useRef(false);

  function currentProgress(): VideoWatchProgress | undefined {
    const video = videoRef.current;
    if (!video || !video.duration) return undefined;
    return {
      secondsWatched: Math.round(video.currentTime),
      percentWatched: Math.round((video.currentTime / video.duration) * 100),
    };
  }

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
      pauseIsProgrammatic.current = true;
      video.pause();
    }
  }, [active, src]);

  // userPaused only reflects the DOM's actual play/pause state, updated
  // via these native events rather than set directly inside the effect
  // above - play() called there dispatches a real "play" event
  // asynchronously, which is what clears the stale paused-overlay rather
  // than a synchronous setState in the effect body.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setUserPaused(false);
    video.addEventListener("play", onPlay);
    return () => video.removeEventListener("play", onPlay);
  }, []);

  useEffect(() => {
    const track = trackRef.current?.track;
    if (!track) return;
    track.mode = captionsOn && captionSrc ? "showing" : "hidden";
  }, [captionsOn, captionSrc]);

  function fireOnce(key: string, milestone: VideoMilestone) {
    if (milestonesFired.current.has(key)) return;
    milestonesFired.current.add(key);
    onMilestone?.(milestone, currentProgress());
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
      onMilestone?.("replayed", currentProgress());
    }
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => undefined);
    }
  }

  function handlePause() {
    if (pauseIsProgrammatic.current) {
      pauseIsProgrammatic.current = false;
      return;
    }
    const video = videoRef.current;
    if (!video || video.ended) return;
    onMilestone?.("paused", currentProgress());
  }

  function togglePlayback() {
    const video = videoRef.current;
    if (!video || !active) return;
    if (video.paused) {
      setUserPaused(false);
      video.play().catch(() => undefined);
    } else {
      setUserPaused(true);
      video.pause();
    }
  }

  function toggleMuted() {
    setMuted((m) => {
      const next = !m;
      onMilestone?.(next ? "muted" : "unmuted", currentProgress());
      return next;
    });
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
        onPause={handlePause}
      >
        {captionSrc && (
          <track ref={trackRef} kind="captions" src={captionSrc} srcLang="en" label="English" default />
        )}
      </video>
      {allowTapToPause && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={userPaused ? "Play video" : "Pause video"}
          className="absolute inset-0 z-[5] flex items-center justify-center"
        >
          {userPaused && (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 text-white">
              <Play className="h-8 w-8 fill-white" />
            </span>
          )}
        </button>
      )}
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
        onClick={toggleMuted}
        aria-label={muted ? "Unmute video" : "Mute video"}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
    </div>
  );
}
