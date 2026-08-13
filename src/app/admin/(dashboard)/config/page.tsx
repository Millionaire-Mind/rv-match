import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfigEditor } from "@/components/admin/config-editor";
import {
  loadIntentWeights,
  loadPilotDefaults,
  loadPlatformConfig,
  loadRecommendationWeights,
} from "@/server/recommendation/config";

export const metadata: Metadata = { title: "Configuration" };
export const dynamic = "force-dynamic";

export default async function AdminConfigPage() {
  const [recommendation, intent, pilot, platform] = await Promise.all([
    loadRecommendationWeights(),
    loadIntentWeights(),
    loadPilotDefaults(),
    loadPlatformConfig(),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          These weights drive the recommendation engine and intent scoring in real time — no
          deploy required. Edit the raw values with care.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weights</CardTitle>
          <CardDescription>
            Signed weights applied per behavioral signal (e.g. a swipe &quot;love&quot; vs a fast
            pass) and platform thresholds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="recommendation">
            <TabsList>
              <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
              <TabsTrigger value="intent">Intent</TabsTrigger>
              <TabsTrigger value="pilot">Pilot Defaults</TabsTrigger>
              <TabsTrigger value="platform">Platform</TabsTrigger>
            </TabsList>
            <TabsContent value="recommendation">
              <ConfigEditor configKey="recommendation_weights" value={recommendation} />
            </TabsContent>
            <TabsContent value="intent">
              <ConfigEditor configKey="intent_weights" value={intent} />
            </TabsContent>
            <TabsContent value="pilot">
              <ConfigEditor configKey="pilot_defaults" value={pilot} />
            </TabsContent>
            <TabsContent value="platform">
              <ConfigEditor configKey="platform" value={platform} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
