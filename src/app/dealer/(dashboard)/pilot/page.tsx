import type { Metadata } from "next";

import { requireDealerContext } from "@/server/dealer/context";
import { getPilotSummary } from "@/server/dealer/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Founding Dealer Pilot" };
export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  pending: "Your pilot starts once your dealership is approved.",
  active: "You're in your Founding Dealer pilot period.",
  conversion_due: "Your pilot has ended — time to choose a plan.",
  converted: "You've converted to a paid plan. Thank you for being a Founding Dealer.",
  expired: "Your pilot period has expired.",
  suspended: "Your pilot is currently suspended.",
};

export default async function DealerPilotPage() {
  const { dealership } = await requireDealerContext();
  const pilot = await getPilotSummary(dealership.id);

  if (!pilot) {
    return <p className="text-muted-foreground">No pilot record found for this dealership.</p>;
  }

  const dayProgress = Math.min(100, ((pilot.trialDays - pilot.daysRemaining) / pilot.trialDays) * 100);
  const salesProgress = Math.min(100, (pilot.verifiedSalesCount / pilot.salesThreshold) * 100);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Founding Dealer Pilot</h1>
        <Badge variant="accent" className="mt-2 capitalize">
          {pilot.status.replace(/_/g, " ")}
        </Badge>
        <p className="mt-2 text-muted-foreground">{STATUS_COPY[pilot.status]}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Free for {pilot.trialDays} days OR {pilot.salesThreshold} verified sales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex justify-between text-sm">
              <span>Days elapsed</span>
              <span>{pilot.daysRemaining} days remaining</span>
            </div>
            <Progress value={dayProgress} className="mt-1" />
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <span>Verified sales</span>
              <span data-testid="pilot-verified-sales">
                {pilot.verifiedSalesCount} / {pilot.salesThreshold}
              </span>
            </div>
            <Progress value={salesProgress} className="mt-1" />
          </div>
          <p className="text-xs text-muted-foreground">
            Only <strong>admin-verified</strong> sales count toward your threshold. Sales you report
            appear in your dashboard as &quot;reported&quot; until an RV Match admin verifies them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
