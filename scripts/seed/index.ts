/**
 * Seeds RV Match with realistic, clearly-synthetic demo data: an admin,
 * two approved dealerships (with owner accounts and active pilots), 20
 * published RVs with generated photos, auto-generated (and a couple of
 * simulated dealer-uploaded) vertical videos, a demo consumer with a real
 * behavioral history, and a lead pipeline all the way through a verified
 * sale — so the full DISCOVER -> LEARN -> MATCH -> LEAD -> SALE -> MEASURE
 * loop is populated and testable immediately after `npm run db:seed`.
 *
 * Safe to re-run: it clears previously-seeded rows (tagged via stock
 * numbers/emails under this script's control) before inserting again.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  attributedSales,
  consumerProfiles,
  dealerPilots,
  dealerships,
  dealershipUsers,
  inventory,
  inventoryFeatures,
  inventoryPhotos,
  inventoryVideos,
  leadActivity,
  leads,
  profiles,
  swipeDecisions as swipeDecisionsTable,
  videoGenerationJobs,
} from "@/server/db/schema";
import { CATALOG } from "./catalog";
import { generatePlaceholderPhoto } from "@/server/media/placeholder-photo";
import { uploadBuffer } from "@/server/storage";
import { processQueuedVideoJobs } from "@/server/video/worker";
import { updatePreferencesForSwipe } from "@/server/recommendation/preferences";
import { loadRecommendationWeights, loadIntentWeights } from "@/server/recommendation/config";
import { computeIntentScore } from "@/server/recommendation/purchase-intent";
import { getBehaviorSnapshot } from "@/server/recommendation/profile";
import { geocodeZip } from "@/server/geo/zip-centroids";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const DEMO_PASSWORD = "RvMatchDemo123!";

async function upsertLocalUser(email: string, fullName: string): Promise<string> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values (${email}, ${passwordHash}, ${sql.json({ full_name: fullName })})
    on conflict (email) do update set encrypted_password = excluded.encrypted_password
    returning id
  `;
  return row.id;
}

async function main() {
  console.log("Seeding RV Match demo data...");

  // --- Clean slate for previously-seeded rows -------------------------
  const existingDealerships = await db
    .select({ id: dealerships.id })
    .from(dealerships)
    .where(inArray(dealerships.slug, ["rocky-mountain-rv-center", "sunshine-state-rv-superstore"]));
  if (existingDealerships.length) {
    await db.delete(dealerships).where(
      inArray(dealerships.id, existingDealerships.map((d) => d.id)),
    );
  }

  // --- Admin --------------------------------------------------------------
  const adminId = await upsertLocalUser("admin@rvmatch.app", "RV Match Admin");
  await db
    .update(profiles)
    .set({ platformRole: "platform_admin" })
    .where(eq(profiles.id, adminId));
  console.log(`Admin: admin@rvmatch.app / ${DEMO_PASSWORD}`);

  // --- Dealerships ----------------------------------------------------
  const dealerDefs = [
    {
      slug: "rocky-mountain-rv-center",
      name: "Rocky Mountain RV Center",
      city: "Denver",
      state: "CO",
      zip: "80202",
      email: "owner@rockymountainrv.example",
      contactName: "Dana Rios",
      catalog: CATALOG.slice(0, Math.ceil(CATALOG.length / 2)),
    },
    {
      slug: "sunshine-state-rv-superstore",
      name: "Sunshine State RV Superstore",
      city: "Tampa",
      state: "FL",
      zip: "33602",
      email: "owner@sunshinestatervs.example",
      contactName: "Marcus Lee",
      catalog: CATALOG.slice(Math.ceil(CATALOG.length / 2)),
    },
  ];

  const createdInventoryIds: string[] = [];
  let firstLeadId: string | null = null;
  let firstDealershipId: string | null = null;
  let firstDealerOwnerId: string | null = null;
  let firstSoldInventoryId: string | null = null;

  for (const [dealerIndex, def] of dealerDefs.entries()) {
    const ownerId = await upsertLocalUser(def.email, def.contactName);
    const geo = geocodeZip(def.zip);

    const [dealership] = await db
      .insert(dealerships)
      .values({
        name: def.name,
        slug: def.slug,
        addressLine1: "1 RV Center Way",
        city: def.city,
        state: def.state,
        zipCode: def.zip,
        lat: geo ? geo.lat.toFixed(6) : null,
        lng: geo ? geo.lng.toFixed(6) : null,
        phone: "555-010-0100",
        website: `https://${def.slug}.example.com`,
        primaryContactName: def.contactName,
        primaryContactEmail: def.email,
        inventorySizeEstimate: def.catalog.length,
        status: "approved",
        approvedAt: new Date(),
        approvedBy: adminId,
      })
      .returning({ id: dealerships.id });

    await db.insert(dealershipUsers).values({
      dealershipId: dealership.id,
      userId: ownerId,
      role: "owner",
    });

    const pilotStart = new Date();
    pilotStart.setDate(pilotStart.getDate() - 12);
    await db.insert(dealerPilots).values({
      dealershipId: dealership.id,
      startedAt: pilotStart,
      trialDays: 90,
      salesThreshold: 3,
      verifiedSalesCount: 0,
      status: "active",
    });

    console.log(`Dealer: ${def.email} / ${DEMO_PASSWORD} (${def.name})`);

    if (dealerIndex === 0) {
      firstDealershipId = dealership.id;
      firstDealerOwnerId = ownerId;
    }

    for (const [i, entry] of def.catalog.entries()) {
      const dateAdded = new Date();
      dateAdded.setDate(dateAdded.getDate() - (30 - i));

      const [rv] = await db
        .insert(inventory)
        .values({
          dealershipId: dealership.id,
          stockNumber: entry.stockNumber,
          year: entry.year,
          make: entry.make,
          model: entry.model,
          floorplan: entry.floorplan,
          rvType: entry.rvType,
          condition: entry.condition,
          msrpCents: entry.msrp * 100,
          salePriceCents: entry.salePrice * 100,
          advertisedPriceCents: entry.advertisedPrice ? entry.advertisedPrice * 100 : null,
          lengthInches: entry.lengthFeet * 12,
          dryWeightLbs: entry.dryWeightLbs,
          gvwrLbs: entry.gvwrLbs,
          sleeps: entry.sleeps,
          slideCount: entry.slideCount,
          bunkhouse: entry.bunkhouse,
          toyHauler: entry.toyHauler,
          outdoorKitchen: entry.outdoorKitchen,
          exteriorColor: entry.exteriorColor,
          description: entry.description,
          city: def.city,
          state: def.state,
          zipCode: def.zip,
          lat: geo ? geo.lat.toFixed(6) : null,
          lng: geo ? geo.lng.toFixed(6) : null,
          status: "published",
          source: "manual",
          dateAdded,
        })
        .returning();

      createdInventoryIds.push(rv.id);

      if (entry.features.length) {
        await db
          .insert(inventoryFeatures)
          .values(entry.features.map((feature) => ({ inventoryId: rv.id, feature })));
      }

      const photoLabels = ["Exterior", "Interior", "Kitchen"];
      const photoUrls: string[] = [];
      for (let p = 0; p < entry.photoColors.length; p++) {
        const buffer = await generatePlaceholderPhoto({
          colorHex: entry.photoColors[p],
          label: photoLabels[p] ?? `${entry.make} ${entry.model}`,
          sublabel: `${entry.year} ${entry.make} ${entry.model}`,
        });
        const url = await uploadBuffer(
          `photos/${rv.id}/${p}.jpg`,
          buffer,
          "image/jpeg",
        );
        photoUrls.push(url);
      }

      const photoRows = await db
        .insert(inventoryPhotos)
        .values(photoUrls.map((url, position) => ({ inventoryId: rv.id, url, position })))
        .returning();

      await db
        .update(inventory)
        .set({ primaryPhotoId: photoRows[0].id })
        .where(eq(inventory.id, rv.id));

      // First RV per dealer simulates an authentic dealer-uploaded video
      // (generated the same way for this demo, but tagged accordingly) to
      // demonstrate that dealer video always outranks auto-generation.
      if (i === 0) {
        const buffer = await generatePlaceholderPhoto({
          colorHex: entry.photoColors[0],
          label: "Dealer Video",
          sublabel: `${entry.year} ${entry.make} ${entry.model}`,
        });
        const url = await uploadBuffer(`videos/${rv.id}/dealer-upload.jpg`, buffer, "image/jpeg");
        const [video] = await db
          .insert(inventoryVideos)
          .values({ inventoryId: rv.id, url, source: "dealer_upload", thumbnailUrl: url })
          .returning({ id: inventoryVideos.id });
        // NOTE: this is a placeholder still image standing in for a real
        // dealer-recorded MP4 in this demo dataset — the important part
        // for the pipeline is that inventory.primaryVideoId is dealer-set
        // and no generation job is queued, matching production behavior.
        await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, rv.id));
      } else {
        await db.insert(videoGenerationJobs).values({ inventoryId: rv.id, status: "queued" });
      }
    }
  }

  console.log(`Queued video generation for published inventory. Processing with FFmpeg...`);
  const jobResult = await processQueuedVideoJobs();
  console.log(`Video generation: ${jobResult.processed} completed, ${jobResult.failed} failed.`);

  // --- Demo consumer with real behavioral history ----------------------
  const [anonSession] = await sql<{ id: string }[]>`
    insert into anonymous_sessions default values returning id
  `;
  const [{ id: demoConsumerProfileId }] = await db
    .insert(consumerProfiles)
    .values({
      anonymousSessionId: anonSession.id,
      zipCode: "80203",
      lat: "39.73",
      lng: "-104.97",
      radiusMiles: 100,
    })
    .returning({ id: consumerProfiles.id });

  const weights = await loadRecommendationWeights();
  const allInventory = await db
    .select()
    .from(inventory)
    .where(inArray(inventory.id, createdInventoryIds));

  let decisionCount = 0;
  for (const rv of allInventory) {
    const likesBunkhouseOutdoorKitchen = rv.bunkhouse && rv.outdoorKitchen;
    const isAffordableTravelTrailer = rv.rvType === "travel_trailer" && rv.salePriceCents <= 4500000;
    const isBigExpensive = rv.rvType === "class_a" || rv.salePriceCents > 15000000;

    let decision: "pass" | "like" | "love" | "more_like_this" = "pass";
    if (likesBunkhouseOutdoorKitchen) decision = "love";
    else if (isAffordableTravelTrailer) decision = "like";
    else if (isBigExpensive) decision = "pass";
    else decision = decisionCount % 3 === 0 ? "like" : "pass";

    await db.insert(swipeDecisionsTable).values({
      consumerProfileId: demoConsumerProfileId,
      inventoryId: rv.id,
      decision,
      swipeDurationMs: 1200 + Math.round(Math.random() * 2000),
    });
    await updatePreferencesForSwipe(demoConsumerProfileId, rv, decision, 1500, weights);
    decisionCount += 1;
  }

  await db
    .update(consumerProfiles)
    .set({ decisionsCount: decisionCount })
    .where(eq(consumerProfiles.id, demoConsumerProfileId));

  console.log(`Demo consumer: ${decisionCount} swipe decisions recorded, preference profile learned.`);

  // --- Leads across the pipeline, including one verified sale ----------
  if (firstDealershipId && firstDealerOwnerId) {
    const dealerInventory = allInventory.filter((rv) => rv.dealershipId === firstDealershipId);
    firstSoldInventoryId = dealerInventory[0]?.id ?? null;
    const intentWeights = await loadIntentWeights();

    const leadDefs: Array<{
      inventoryId: string;
      status: "new" | "contacted" | "appointment" | "sold";
      ctaType: "check_availability" | "ask_question" | "schedule_walkthrough";
      name: string;
    }> = [
      {
        inventoryId: dealerInventory[0].id,
        status: "sold",
        ctaType: "schedule_walkthrough",
        name: "Jordan Bennett",
      },
      {
        inventoryId: dealerInventory[1].id,
        status: "appointment",
        ctaType: "check_availability",
        name: "Casey Nguyen",
      },
      {
        inventoryId: dealerInventory[2].id,
        status: "contacted",
        ctaType: "ask_question",
        name: "Priya Shah",
      },
      {
        inventoryId: dealerInventory[3].id,
        status: "new",
        ctaType: "check_availability",
        name: "Sam Ortiz",
      },
    ];

    for (const def of leadDefs) {
      const intent = await computeIntentScore({
        consumerProfileId: demoConsumerProfileId,
        dealershipId: firstDealershipId,
        ctaType: def.ctaType,
        weights: intentWeights,
      });
      const snapshot = await getBehaviorSnapshot(demoConsumerProfileId);

      const [lead] = await db
        .insert(leads)
        .values({
          dealershipId: firstDealershipId,
          inventoryId: def.inventoryId,
          consumerProfileId: demoConsumerProfileId,
          name: def.name,
          email: `${def.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          phone: "555-019-2233",
          preferredContact: "email",
          message: "Interested in learning more about this RV.",
          ctaType: def.ctaType,
          intentScore: intent.score.toFixed(2),
          intentReasons: intent.reasons,
          behaviorSnapshot: snapshot,
          status: def.status === "sold" ? "sold" : def.status,
          assignedTo: firstDealerOwnerId,
        })
        .returning({ id: leads.id });

      await db.insert(leadActivity).values({
        leadId: lead.id,
        actorId: firstDealerOwnerId,
        activityType: "status_change",
        fromStatus: "new",
        toStatus: def.status === "sold" ? "sold" : def.status,
        note: "Seeded demo lead.",
      });

      if (def.status === "sold") {
        firstLeadId = lead.id;
      }
    }

    if (firstLeadId && firstSoldInventoryId) {
      const [sale] = await db
        .insert(attributedSales)
        .values({
          leadId: firstLeadId,
          dealershipId: firstDealershipId,
          soldInventoryId: firstSoldInventoryId,
          isOriginalLeadRv: true,
          salePriceCents: dealerInventory[0].salePriceCents,
          saleDate: new Date().toISOString().slice(0, 10),
          salespersonId: firstDealerOwnerId,
          notes: "Seeded demo sale.",
          verificationStatus: "verified",
          verifiedBy: adminId,
          verifiedAt: new Date(),
        })
        .returning({ id: attributedSales.id });

      await db
        .update(dealerPilots)
        .set({ verifiedSalesCount: 1 })
        .where(eq(dealerPilots.dealershipId, firstDealershipId));

      await db
        .update(inventory)
        .set({ status: "sold", dateSold: new Date() })
        .where(eq(inventory.id, firstSoldInventoryId));

      console.log(`Verified sale seeded: ${sale.id}`);
    }
  }

  console.log("\nSeed complete.");
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD}):`);
  console.log("  Admin:  admin@rvmatch.app");
  console.log("  Dealer: owner@rockymountainrv.example (Rocky Mountain RV Center)");
  console.log("  Dealer: owner@sunshinestatervs.example (Sunshine State RV Superstore)");

  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
