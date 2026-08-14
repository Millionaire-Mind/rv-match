// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { UseMyLocationButton } from "./use-my-location-button";

/**
 * Gap 8 (targeted gap-closure pass): browser geolocation is optional and
 * must degrade gracefully - granted, denied, and unsupported-browser all
 * need to leave the consumer with a clear, non-alarming path forward
 * (the ZIP field this button always sits next to).
 */

const submitGeolocation = vi.fn();
vi.mock("@/server/discovery/location", () => ({
  submitGeolocation: (...args: unknown[]) => submitGeolocation(...args),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  submitGeolocation.mockReset();
  delete (navigator as unknown as { geolocation?: unknown }).geolocation;
});

describe("UseMyLocationButton", () => {
  it("submits the browser's coordinates and calls onSuccess when permission is granted", async () => {
    submitGeolocation.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({ coords: { latitude: 39.7392, longitude: -104.9903 } } as GeolocationPosition);
        },
      },
    });

    const onSuccess = vi.fn();
    render(<UseMyLocationButton onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(submitGeolocation).toHaveBeenCalledWith(39.7392, -104.9903);
    expect(screen.queryByText(/couldn't access your location/i)).not.toBeInTheDocument();
  });

  it("falls back gracefully to the ZIP field with a non-alarming message when permission is denied", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: "User denied Geolocation" } as GeolocationPositionError);
        },
      },
    });

    const onSuccess = vi.fn();
    render(<UseMyLocationButton onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn't access your location.*enter your zip code below/i)).toBeInTheDocument(),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(submitGeolocation).not.toHaveBeenCalled();
    // The button itself is still present and re-clickable - no dead end.
    expect(screen.getByRole("button", { name: /use my location/i })).toBeEnabled();
  });

  it("shows a graceful message instead of throwing when the browser has no geolocation API", async () => {
    const onSuccess = vi.fn();
    render(<UseMyLocationButton onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => expect(screen.getByText(/isn't available in this browser/i)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(submitGeolocation).not.toHaveBeenCalled();
  });
});
