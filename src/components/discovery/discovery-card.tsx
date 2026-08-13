"use client";

import Link from "next/link";
import { motion, useAnimation, type PanInfo } from "framer-motion";
import { ChevronUp, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDistance } from "@/lib/utils";
import type { DiscoveryCardDTO } from "@/server/discovery/dto";
import { VideoPlayer } from "./video-player";

interface DiscoveryCardProps {
  card: DiscoveryCardDTO;
  active: boolean;
  onDecision: (decision: "pass" | "like" | "love") => void;
  onMilestone: (milestone: "started" | "25" | "50" | "75" | "complete" | "replayed") => void;
}

const SWIPE_THRESHOLD = 120;

export function DiscoveryCard({ card, active, onDecision, onMilestone }: DiscoveryCardProps) {
  const controls = useAnimation();

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      controls.start({ x: 500, opacity: 0, rotate: 15, transition: { duration: 0.25 } });
      onDecision("like");
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      controls.start({ x: -500, opacity: 0, rotate: -15, transition: { duration: 0.25 } });
      onDecision("pass");
    } else {
      controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  }

  return (
    <motion.article
      drag={active ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      animate={controls}
      className="absolute inset-0 touch-none select-none overflow-hidden rounded-2xl shadow-2xl"
      style={{ zIndex: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
      aria-label={`${card.year} ${card.make} ${card.model}`}
    >
      <VideoPlayer
        src={card.videoUrl}
        poster={card.photos[0] ?? null}
        active={active}
        className="h-full w-full"
        onMilestone={onMilestone}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 pb-28 text-white sm:pb-24">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={card.condition === "new" ? "accent" : "secondary"}>
            {card.condition === "new" ? "New" : "Used"}
          </Badge>
          <Badge variant="outline" className="border-white/40 text-white">
            {card.rvTypeLabel}
          </Badge>
          {card.isExploration && (
            <Badge variant="outline" className="border-white/40 text-white">
              Something new
            </Badge>
          )}
        </div>
        <h2 className="mt-2 text-2xl font-semibold leading-tight">
          {card.year} {card.make} {card.model}
        </h2>
        {card.floorplan && <p className="text-sm text-white/80">Floorplan {card.floorplan}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
          <span className="text-lg font-semibold text-white">{formatCurrency(card.priceCents)}</span>
          {card.sleeps && <span>Sleeps {card.sleeps}</span>}
          {card.bunkhouse && <span>Bunkhouse</span>}
          {card.outdoorKitchen && <span>Outdoor Kitchen</span>}
          {card.toyHauler && <span>Toy Hauler</span>}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-white/75">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            {card.dealerName}
            {card.city && card.state ? ` · ${card.city}, ${card.state}` : ""}
            {card.distanceMiles !== null ? ` · ${formatDistance(card.distanceMiles)}` : ""}
          </span>
        </div>
        <Link
          href={`/rv/${card.id}`}
          className="pointer-events-auto mt-3 inline-flex items-center gap-1 text-sm font-medium text-white underline underline-offset-4"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          View full details
        </Link>
      </div>
    </motion.article>
  );
}
