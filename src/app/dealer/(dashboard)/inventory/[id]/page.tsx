import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { requireDealerContext } from "@/server/dealer/context";
import { db } from "@/server/db/client";
import { inventory, inventoryFeatures, inventoryPhotos, inventoryVideos, videoGenerationJobs } from "@/server/db/schema";
import { InventoryForm } from "@/components/dealer/inventory-form";
import { PhotoUploader } from "@/components/dealer/photo-uploader";
import { VideoManager } from "@/components/dealer/video-manager";
import { updateInventory, type InventoryFormState } from "@/server/dealer/inventory-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit RV" };
export const dynamic = "force-dynamic";

export default async function EditInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dealership } = await requireDealerContext();

  const [rv] = await db.select().from(inventory).where(eq(inventory.id, id)).limit(1);
  if (!rv || rv.dealershipId !== dealership.id) notFound();

  const [photos, videos, features, jobs] = await Promise.all([
    db.select().from(inventoryPhotos).where(eq(inventoryPhotos.inventoryId, id)).orderBy(inventoryPhotos.position),
    db.select().from(inventoryVideos).where(eq(inventoryVideos.inventoryId, id)),
    db.select().from(inventoryFeatures).where(eq(inventoryFeatures.inventoryId, id)),
    db
      .select()
      .from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.inventoryId, id))
      .orderBy(desc(videoGenerationJobs.createdAt))
      .limit(1),
  ]);

  async function action(_prev: InventoryFormState, formData: FormData): Promise<InventoryFormState> {
    "use server";
    return updateInventory(dealership.id, id, _prev, formData);
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {rv.year} {rv.make} {rv.model}
        </h1>
        <p className="text-sm text-muted-foreground">Stock #{rv.stockNumber}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt="" className="h-24 w-32 rounded-md object-cover" />
              ))}
            </div>
          )}
          <PhotoUploader dealershipId={dealership.id} inventoryId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Video</CardTitle>
        </CardHeader>
        <CardContent>
          <VideoManager
            dealershipId={dealership.id}
            inventoryId={id}
            videos={videos}
            primaryVideoId={rv.primaryVideoId}
            latestJob={jobs[0] ?? null}
            hasPhotos={photos.length > 0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <InventoryForm
            action={action}
            submitLabel="Save Changes"
            defaults={{
              stockNumber: rv.stockNumber,
              vin: rv.vin ?? undefined,
              year: rv.year,
              make: rv.make,
              brand: rv.brand ?? undefined,
              model: rv.model,
              floorplan: rv.floorplan ?? undefined,
              rvType: rv.rvType,
              condition: rv.condition,
              msrpCents: rv.msrpCents,
              salePriceCents: rv.salePriceCents,
              advertisedPriceCents: rv.advertisedPriceCents,
              lengthInches: rv.lengthInches,
              widthInches: rv.widthInches,
              heightInches: rv.heightInches,
              dryWeightLbs: rv.dryWeightLbs,
              gvwrLbs: rv.gvwrLbs,
              hitchWeightLbs: rv.hitchWeightLbs,
              sleeps: rv.sleeps,
              slideCount: rv.slideCount,
              bedConfiguration: rv.bedConfiguration ?? undefined,
              bunkhouse: rv.bunkhouse,
              toyHauler: rv.toyHauler,
              outdoorKitchen: rv.outdoorKitchen,
              exteriorColor: rv.exteriorColor ?? undefined,
              interior: rv.interior ?? undefined,
              description: rv.description ?? undefined,
              city: rv.city ?? undefined,
              state: rv.state ?? undefined,
              zipCode: rv.zipCode ?? undefined,
              features: features.map((f) => f.feature).join(", "),
              canonicalUrl: rv.canonicalUrl ?? undefined,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
