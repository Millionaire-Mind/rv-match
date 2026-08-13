export type PilotStatusValue =
  | "pending"
  | "active"
  | "conversion_due"
  | "converted"
  | "expired"
  | "suspended";

/**
 * Pure pilot-status derivation, kept separate from any DB access so it's
 * directly unit-testable (see src/server/pilot/logic.test.ts).
 *
 * `pending` and `suspended` are administrative states that only change via
 * an explicit admin action (approve / suspend / reactivate) — they're
 * passed through untouched. Everything else is derived live from the
 * dealer's actual sales/time progress, so the pilot status never drifts
 * out of sync with reality even if nothing re-saves the row.
 */
export function computePilotStatus(params: {
  verifiedSalesCount: number;
  salesThreshold: number;
  startedAt: Date;
  trialDays: number;
  storedStatus: PilotStatusValue;
  now?: Date;
}): PilotStatusValue {
  if (params.storedStatus === "pending" || params.storedStatus === "suspended") {
    return params.storedStatus;
  }
  if (params.verifiedSalesCount >= params.salesThreshold) {
    return "converted";
  }
  const now = params.now ?? new Date();
  const elapsedDays = Math.floor((now.getTime() - params.startedAt.getTime()) / 86400000);
  if (elapsedDays >= params.trialDays) {
    return "conversion_due";
  }
  return "active";
}

export function daysRemaining(startedAt: Date, trialDays: number, now: Date = new Date()): number {
  const elapsedDays = Math.floor((now.getTime() - startedAt.getTime()) / 86400000);
  return Math.max(0, trialDays - elapsedDays);
}
