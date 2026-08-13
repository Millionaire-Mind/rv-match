import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, inventoryFeedRuns, inventoryFeedSources } from "@/server/db/schema";

/**
 * Integration tests for the Phase 14 generic feed import framework's
 * execution path: fetch -> parse -> map -> validate -> upsert, with a
 * mocked network fetch (fetchFeedText) so this exercises the real
 * pipeline against real Postgres without making an actual HTTP request.
 */

const fetchFeedTextMock = vi.fn<(url: string) => Promise<string>>();
vi.mock("./fetch-feed", () => ({
  fetchFeedText: (url: string) => fetchFeedTextMock(url),
  assertPublicFeedUrl: (url: string) => new URL(url),
}));

const { runFeedImport, processDueFeedSources } = await import("./run");

let dealershipId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_feed_import__",
      slug: `__test-feed-import-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `feed-import-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;
});

afterEach(() => {
  fetchFeedTextMock.mockReset();
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

async function makeFeedSource(overrides: Partial<typeof inventoryFeedSources.$inferInsert> = {}) {
  const [row] = await db
    .insert(inventoryFeedSources)
    .values({
      dealershipId,
      name: "Test Feed",
      format: "csv",
      url: "https://example.com/feed.csv",
      fieldMapping: {},
      ...overrides,
    })
    .returning();
  return row;
}

describe("runFeedImport", () => {
  it("creates new inventory rows from a valid CSV feed and records a succeeded run", async () => {
    const suffix = Date.now();
    fetchFeedTextMock.mockResolvedValue(
      `stock_number,year,make,model,rv_type,condition,sale_price,bunkhouse\nFEED-${suffix},2024,Forest River,Rockwood,travel_trailer,new,35000,true`,
    );
    const source = await makeFeedSource();

    const summary = await runFeedImport(source.id);
    expect(summary.status).toBe("succeeded");
    expect(summary.rowsCreated).toBe(1);
    expect(summary.rowsFailed).toBe(0);

    const [rv] = await db.select().from(inventory).where(eq(inventory.stockNumber, `FEED-${suffix}`));
    expect(rv).toBeDefined();
    expect(rv.source).toBe("feed_import");
    expect(rv.bunkhouse).toBe(true);

    const [run] = await db.select().from(inventoryFeedRuns).where(eq(inventoryFeedRuns.feedSourceId, source.id));
    expect(run.status).toBe("succeeded");
    expect(run.rowsCreated).toBe(1);

    const [updatedSource] = await db.select().from(inventoryFeedSources).where(eq(inventoryFeedSources.id, source.id));
    expect(updatedSource.lastRunStatus).toBe("succeeded");
    expect(updatedSource.lastRunAt).not.toBeNull();
  });

  it("updates an existing RV (by stock number) on a second run instead of duplicating it", async () => {
    const suffix = Date.now();
    const stockNumber = `FEED-UPD-${suffix}`;
    fetchFeedTextMock.mockResolvedValue(
      `stock_number,year,make,model,rv_type,condition,sale_price\n${stockNumber},2024,Forest River,Rockwood,travel_trailer,new,35000`,
    );
    const source = await makeFeedSource();
    await runFeedImport(source.id);

    fetchFeedTextMock.mockResolvedValue(
      `stock_number,year,make,model,rv_type,condition,sale_price\n${stockNumber},2024,Forest River,Rockwood,travel_trailer,new,39900`,
    );
    const second = await runFeedImport(source.id);
    expect(second.rowsUpdated).toBe(1);
    expect(second.rowsCreated).toBe(0);

    const rows = await db.select().from(inventory).where(eq(inventory.stockNumber, stockNumber));
    expect(rows).toHaveLength(1);
    expect(rows[0].salePriceCents).toBe(3990000);
  });

  it("continues past an individually-invalid row and reports it as a per-row failure, not an aborted run", async () => {
    const suffix = Date.now();
    fetchFeedTextMock.mockResolvedValue(
      [
        "stock_number,year,make,model,rv_type,condition,sale_price",
        `FEED-GOOD-${suffix},2024,Forest River,Rockwood,travel_trailer,new,35000`,
        `FEED-BAD-${suffix},2024,Forest River,Rockwood,travel_trailer,new,not-a-number`,
      ].join("\n"),
    );
    const source = await makeFeedSource();

    const summary = await runFeedImport(source.id);
    expect(summary.status).toBe("succeeded"); // partial success - not every row failed
    expect(summary.rowsCreated).toBe(1);
    expect(summary.rowsFailed).toBe(1);
    expect(summary.errors[0]).toContain(`FEED-BAD-${suffix}`);
  });

  it("marks the run failed when the feed URL/parse fails entirely", async () => {
    fetchFeedTextMock.mockRejectedValue(new Error("Feed URL returned HTTP 404."));
    const source = await makeFeedSource();

    const summary = await runFeedImport(source.id);
    expect(summary.status).toBe("failed");
    expect(summary.errors[0]).toContain("404");
  });

  it("parses a JSON feed via its record path and applies a field mapping", async () => {
    const suffix = Date.now();
    fetchFeedTextMock.mockResolvedValue(
      JSON.stringify({
        vehicles: [
          {
            StockNum: `FEED-JSON-${suffix}`,
            Yr: 2023,
            Mfr: "Jayco",
            Mdl: "Eagle",
            Type: "fifth_wheel",
            Cond: "used",
            Price: 42000,
          },
        ],
      }),
    );
    const source = await makeFeedSource({
      format: "json",
      recordPath: "vehicles",
      fieldMapping: {
        stock_number: "StockNum",
        year: "Yr",
        make: "Mfr",
        model: "Mdl",
        rv_type: "Type",
        condition: "Cond",
        sale_price: "Price",
      },
    });

    const summary = await runFeedImport(source.id);
    expect(summary.rowsCreated).toBe(1);

    const [rv] = await db.select().from(inventory).where(eq(inventory.stockNumber, `FEED-JSON-${suffix}`));
    expect(rv.make).toBe("Jayco");
    expect(rv.rvType).toBe("fifth_wheel");
  });
});

describe("processDueFeedSources", () => {
  it("runs an active source with no prior run and a refresh interval set", async () => {
    fetchFeedTextMock.mockResolvedValue(
      `stock_number,year,make,model,rv_type,condition,sale_price\nFEED-DUE-${Date.now()},2024,Forest River,Rockwood,travel_trailer,new,35000`,
    );
    const source = await makeFeedSource({ refreshIntervalMinutes: 60 });

    const result = await processDueFeedSources();
    expect(result.ranCount).toBeGreaterThanOrEqual(1);

    const [updated] = await db.select().from(inventoryFeedSources).where(eq(inventoryFeedSources.id, source.id));
    expect(updated.lastRunAt).not.toBeNull();
  });

  it("does not run a source with no refresh interval set (manual-only)", async () => {
    const source = await makeFeedSource({ refreshIntervalMinutes: null });

    await processDueFeedSources();

    const [row] = await db.select().from(inventoryFeedSources).where(eq(inventoryFeedSources.id, source.id));
    expect(row.lastRunAt).toBeNull();
    expect(fetchFeedTextMock).not.toHaveBeenCalled();
  });

  it("does not run an inactive source even with a refresh interval set", async () => {
    const source = await makeFeedSource({ refreshIntervalMinutes: 60, active: false });

    await processDueFeedSources();

    const [row] = await db.select().from(inventoryFeedSources).where(eq(inventoryFeedSources.id, source.id));
    expect(row.lastRunAt).toBeNull();
  });

  it("does not re-run a source whose refresh interval hasn't elapsed yet", async () => {
    fetchFeedTextMock.mockResolvedValue(
      `stock_number,year,make,model,rv_type,condition,sale_price\nFEED-NOTDUE-${Date.now()},2024,Forest River,Rockwood,travel_trailer,new,35000`,
    );
    const source = await makeFeedSource({ refreshIntervalMinutes: 60 });
    await runFeedImport(source.id); // sets lastRunAt to now

    fetchFeedTextMock.mockClear();
    await processDueFeedSources();
    expect(fetchFeedTextMock).not.toHaveBeenCalled();
  });
});
