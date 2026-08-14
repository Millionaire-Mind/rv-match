// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DiscoveryFeed } from "./discovery-feed";
import type { DiscoveryCardDTO } from "@/server/discovery/dto";

/**
 * Gap 1 (targeted gap-closure pass): PASS/LIKE/LOVE/MORE-LIKE-THIS/Save must
 * not be represented as successfully completed until the server confirms
 * persistence, and a failed request must not disappear silently. These
 * tests exercise the client state machine directly (mocking only the
 * server-action boundary, video playback, and the location-prompt dialog -
 * none of which this gap touches) rather than the scoring/idempotency logic
 * itself, which `src/server/discovery/event-integrity.test.ts` already
 * covers at the server layer.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("./video-player", () => ({
  VideoPlayer: () => null,
  videoMilestoneToEventType: (milestone: string) => `video_${milestone}`,
}));

vi.mock("./location-prompt", () => ({
  LocationPrompt: () => null,
}));

const submitSwipeDecision = vi.fn();
const toggleSaveInventory = vi.fn();
const fetchDiscoveryBatch = vi.fn();
const recordClientEvent = vi.fn();

vi.mock("@/server/discovery/actions", () => ({
  submitSwipeDecision: (...args: unknown[]) => submitSwipeDecision(...args),
  toggleSaveInventory: (...args: unknown[]) => toggleSaveInventory(...args),
  fetchDiscoveryBatch: (...args: unknown[]) => fetchDiscoveryBatch(...args),
  recordClientEvent: (...args: unknown[]) => recordClientEvent(...args),
}));

beforeAll(() => {
  // framer-motion doesn't require these under jsdom for the simple
  // transform/opacity animations this component uses, but stub them
  // defensively since jsdom itself doesn't implement them.
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

beforeEach(() => {
  submitSwipeDecision.mockReset();
  toggleSaveInventory.mockReset();
  fetchDiscoveryBatch.mockReset().mockResolvedValue([]);
  recordClientEvent.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

function makeCard(overrides: Partial<DiscoveryCardDTO> & { id: string; year: number; make: string }): DiscoveryCardDTO {
  return {
    model: "Test Model",
    floorplan: null,
    rvTypeLabel: "Travel Trailer",
    condition: "new",
    priceCents: 3500000,
    msrpCents: null,
    city: "Denver",
    state: "CO",
    distanceMiles: null,
    sleeps: 6,
    slideCount: 1,
    bunkhouse: false,
    toyHauler: false,
    outdoorKitchen: false,
    dealerName: "Test Dealer",
    dealerId: "dealer-1",
    photos: [],
    videoUrl: "/media/videos/test.mp4",
    videoCaptionUrl: null,
    fitScore: 80,
    isExploration: false,
    explanations: [],
    ...overrides,
  };
}

const cardA = makeCard({ id: "rv-a", year: 2024, make: "Forest River" });
const cardB = makeCard({ id: "rv-b", year: 2023, make: "Grand Design" });
const cardC = makeCard({ id: "rv-c", year: 2022, make: "Keystone" });

function renderFeed(initialCards: DiscoveryCardDTO[] = [cardA, cardB, cardC]) {
  return render(
    <DiscoveryFeed
      initialCards={initialCards}
      initialDecisionsCount={0}
      hasLocation={true}
      locationPromptThreshold={100}
      matchCompleteThreshold={100}
    />,
  );
}

describe("DiscoveryFeed swipe persistence", () => {
  it("does not advance the feed until the server confirms the swipe persisted", async () => {
    let resolveSwipe: (value: { decisionsCount: number }) => void = () => {};
    submitSwipeDecision.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSwipe = resolve;
      }),
    );

    renderFeed();
    expect(screen.getByText("2024 Forest River Test Model")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    // Persistence hasn't resolved yet - the feed must still show card A.
    expect(screen.getByText("2024 Forest River Test Model")).toBeInTheDocument();
    expect(submitSwipeDecision).toHaveBeenCalledTimes(1);
    expect(submitSwipeDecision).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryId: "rv-a", decision: "like" }),
    );

    resolveSwipe({ decisionsCount: 1 });

    await waitFor(() => expect(screen.getByText("2023 Grand Design Test Model")).toBeInTheDocument());
  });

  it("advances on a successful PASS", async () => {
    submitSwipeDecision.mockResolvedValueOnce({ decisionsCount: 1 });
    renderFeed();

    fireEvent.click(screen.getByRole("button", { name: "Pass" }));

    await waitFor(() => expect(screen.getByText("2023 Grand Design Test Model")).toBeInTheDocument());
    expect(submitSwipeDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: "pass" }));
  });

  it("advances on a successful LOVE", async () => {
    submitSwipeDecision.mockResolvedValueOnce({ decisionsCount: 1 });
    renderFeed();

    fireEvent.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => expect(screen.getByText("2023 Grand Design Test Model")).toBeInTheDocument());
    expect(submitSwipeDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: "love" }));
  });

  it("MORE LIKE THIS persists and re-fetches upcoming recommendations", async () => {
    submitSwipeDecision.mockResolvedValueOnce({ decisionsCount: 1 });
    const nextBatchCard = makeCard({ id: "rv-fresh", year: 2025, make: "Jayco" });
    fetchDiscoveryBatch.mockResolvedValueOnce([nextBatchCard]);

    renderFeed();
    fireEvent.click(screen.getByRole("button", { name: "More like this" }));

    await waitFor(() => expect(screen.getByText("2023 Grand Design Test Model")).toBeInTheDocument());
    expect(submitSwipeDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: "more_like_this" }));
    await waitFor(() => expect(fetchDiscoveryBatch).toHaveBeenCalled());
  });

  it("a failed swipe does not disappear silently and offers a working retry", async () => {
    submitSwipeDecision.mockRejectedValueOnce(new Error("network error"));
    renderFeed();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/didn't save/i));
    // The card must still be the one the failed decision was about - not
    // silently advanced past.
    expect(screen.getByText("2024 Forest River Test Model")).toBeInTheDocument();

    submitSwipeDecision.mockResolvedValueOnce({ decisionsCount: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("2023 Grand Design Test Model")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(submitSwipeDecision).toHaveBeenCalledTimes(2);
  });

  it("rapid duplicate clicks on the same card submit only one swipe request", async () => {
    let resolveSwipe: (value: { decisionsCount: number }) => void = () => {};
    submitSwipeDecision.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSwipe = resolve;
      }),
    );
    renderFeed();

    const likeButton = screen.getByRole("button", { name: "Like" });
    fireEvent.click(likeButton);
    fireEvent.click(likeButton);
    fireEvent.click(likeButton);

    expect(submitSwipeDecision).toHaveBeenCalledTimes(1);
    resolveSwipe({ decisionsCount: 1 });
    await waitFor(() => expect(screen.getByText("2023 Grand Design Test Model")).toBeInTheDocument());
  });
});

describe("DiscoveryFeed save persistence", () => {
  it("does not mark an RV as saved until the server confirms it", async () => {
    let resolveSave: (value: { saved: boolean }) => void = () => {};
    toggleSaveInventory.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderFeed();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    resolveSave({ saved: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove from saved" })).toBeInTheDocument());
  });

  it("a failed Save does not falsely appear saved, and retry succeeds", async () => {
    toggleSaveInventory.mockRejectedValueOnce(new Error("network error"));
    renderFeed();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't save/i));
    // Must still read as unsaved - not falsely flipped to a saved state.
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove from saved" })).not.toBeInTheDocument();

    toggleSaveInventory.mockResolvedValueOnce({ saved: true });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove from saved" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
