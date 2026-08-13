import { count, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerPreferences, savedInventory, swipeDecisions } from "@/server/db/schema";
import { rvTypeLabels, type RvType } from "@/server/validation/enums";
import { normalizedAttributeScore } from "./preferences";

export interface PreferenceHighlight {
  attribute: string;
  value: string;
  label: string;
  strength: number; // 0-100, a normalized *preference score*, not a probability
}

const ATTRIBUTE_LABELS: Record<string, (value: string) => string> = {
  rv_type: (v) => rvTypeLabels[v as RvType] ?? v,
  make: (v) => v,
  bunkhouse: () => "Bunkhouse",
  outdoor_kitchen: () => "Outdoor Kitchen",
  toy_hauler: () => "Toy Hauler",
  price_band: (v) => {
    const [low, high] = v.split("-").map(Number);
    return `$${(low / 1000).toFixed(0)}K–$${(high / 1000).toFixed(0)}K`;
  },
  length_band: (v) => v.replace("ft", " ft"),
  sleeps_band: (v) => `Sleeps ${v}`,
  slide_count: (v) => `${v} slide${v === "1" ? "" : "s"}`,
  condition: (v) => (v === "new" ? "New" : "Used"),
};

/**
 * The consumer-facing preference profile: top learned attributes, ranked
 * by (dampened, bounded) preference score. Explicitly presented as a
 * normalized preference score, not a statistical probability — see the
 * UI copy in the Match Results page.
 */
export async function getPreferenceHighlights(
  consumerProfileId: string,
  limit = 6,
): Promise<PreferenceHighlight[]> {
  const rows = await db
    .select()
    .from(consumerPreferences)
    .where(eq(consumerPreferences.consumerProfileId, consumerProfileId));

  const highlights = rows
    .filter((r) => !["dealer", "make"].includes(r.attribute) || r.observations >= 2)
    .map((r) => {
      const normalized = normalizedAttributeScore({
        score: Number(r.score),
        observations: r.observations,
      });
      return {
        attribute: r.attribute,
        value: r.value,
        label: (ATTRIBUTE_LABELS[r.attribute] ?? ((v: string) => v))(r.value),
        strength: Math.round(Math.max(0, normalized) * 100),
      };
    })
    .filter((h) => h.strength > 0)
    .sort((a, b) => b.strength - a.strength);

  return highlights.slice(0, limit);
}

export interface BehaviorSnapshot {
  rvsViewed: number;
  likes: number;
  loves: number;
  passes: number;
  moreLikeThis: number;
  saves: number;
  topPreferences: PreferenceHighlight[];
}

export async function getBehaviorSnapshot(consumerProfileId: string): Promise<BehaviorSnapshot> {
  const [decisionCounts, saveCountRow, topPreferences] = await Promise.all([
    db
      .select({ decision: swipeDecisions.decision, n: count() })
      .from(swipeDecisions)
      .where(eq(swipeDecisions.consumerProfileId, consumerProfileId))
      .groupBy(swipeDecisions.decision),
    db
      .select({ n: count() })
      .from(savedInventory)
      .where(eq(savedInventory.consumerProfileId, consumerProfileId)),
    getPreferenceHighlights(consumerProfileId, 4),
  ]);

  const byDecision = Object.fromEntries(decisionCounts.map((d) => [d.decision, d.n]));
  const rvsViewed = decisionCounts.reduce((sum, d) => sum + d.n, 0);

  return {
    rvsViewed,
    likes: byDecision.like ?? 0,
    loves: byDecision.love ?? 0,
    passes: byDecision.pass ?? 0,
    moreLikeThis: byDecision.more_like_this ?? 0,
    saves: saveCountRow[0]?.n ?? 0,
    topPreferences,
  };
}

export async function getDecisionsCount(consumerProfileId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(swipeDecisions)
    .where(eq(swipeDecisions.consumerProfileId, consumerProfileId));
  return row?.n ?? 0;
}
