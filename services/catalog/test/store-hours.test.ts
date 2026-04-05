import { describe, expect, it } from "vitest";
import { resolveStoreHoursState } from "../src/store-hours.js";

describe("store-hours utility", () => {
  it("handles Daily store hours and next open times", () => {
    const closedState = resolveStoreHoursState("Daily · 7:00 AM - 6:00 PM", new Date("2026-03-10T02:00:00.000Z"), "UTC");

    expect(closedState).toEqual({
      isOpen: false,
      nextOpenAt: "2026-03-10T07:00:00.000Z"
    });

    const openState = resolveStoreHoursState("Daily · 7:00 AM - 6:00 PM", new Date("2026-03-10T12:00:00.000Z"), "UTC");
    expect(openState).toEqual({
      isOpen: true,
      nextOpenAt: null
    });
  });

  it("handles Weekdays store hours", () => {
    const closedState = resolveStoreHoursState("Weekdays · 7:00 AM - 6:00 PM", new Date("2026-03-14T12:00:00.000Z"), "UTC");

    expect(closedState).toEqual({
      isOpen: false,
      nextOpenAt: "2026-03-16T07:00:00.000Z"
    });
  });
});
