"use client";

import { Heart, Sparkles, X, Bookmark } from "lucide-react";

import { cn } from "@/lib/utils";

interface SwipeButtonsProps {
  onPass: () => void;
  onLike: () => void;
  onLove: () => void;
  onMoreLikeThis: () => void;
  onSave: () => void;
  saved: boolean;
  disabled?: boolean;
}

export function SwipeButtons({
  onPass,
  onLike,
  onLove,
  onMoreLikeThis,
  onSave,
  saved,
  disabled,
}: SwipeButtonsProps) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-6 z-20 flex items-center justify-center gap-3 px-4 sm:bottom-8">
      <CircleButton
        label="Pass"
        onClick={onPass}
        disabled={disabled}
        className="h-14 w-14 bg-white text-zinc-700 hover:bg-zinc-100"
      >
        <X className="h-6 w-6" />
      </CircleButton>
      <CircleButton
        label="More like this"
        onClick={onMoreLikeThis}
        disabled={disabled}
        className="h-11 w-11 bg-white/90 text-accent hover:bg-white"
      >
        <Sparkles className="h-5 w-5" />
      </CircleButton>
      <CircleButton
        label="Like"
        onClick={onLike}
        disabled={disabled}
        className="h-16 w-16 bg-accent text-accent-foreground hover:opacity-90"
      >
        <Heart className="h-7 w-7" />
      </CircleButton>
      <CircleButton
        label="Love"
        onClick={onLove}
        disabled={disabled}
        className="h-14 w-14 bg-rose-600 text-white hover:bg-rose-500"
      >
        <Heart className="h-6 w-6 fill-current" />
      </CircleButton>
      <CircleButton
        label={saved ? "Remove from saved" : "Save"}
        onClick={onSave}
        disabled={disabled}
        className={cn(
          "h-11 w-11 bg-white/90 hover:bg-white",
          saved ? "text-accent" : "text-zinc-700",
        )}
      >
        <Bookmark className={cn("h-5 w-5", saved && "fill-current")} />
      </CircleButton>
    </div>
  );
}

function CircleButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
