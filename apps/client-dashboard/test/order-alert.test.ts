import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NewOrderTracker,
  enableNewOrderSound,
  isNewOrderSoundEnabled,
  resetNewOrderAlert
} from "../src/order-alert";
import { resolveOrder, type OperatorOrder } from "../src/model";

const orderOneId = "11111111-1111-4111-8111-111111111111";
const orderTwoId = "22222222-2222-4222-8222-222222222222";

function order(id: string, status: OperatorOrder["status"]) {
  return resolveOrder({
    id,
    locationId: "flagship-01",
    status,
    items: [],
    total: { currency: "USD", amountCents: 1200 },
    pickupCode: id.slice(0, 6),
    timeline: [{ status, occurredAt: "2026-06-10T12:00:00.000Z" }]
  });
}

describe("new order tracker", () => {
  afterEach(() => {
    resetNewOrderAlert();
    vi.unstubAllGlobals();
  });

  it("uses the first snapshot as a silent baseline", () => {
    const tracker = new NewOrderTracker();

    expect(tracker.observe("operator:location", [order(orderOneId, "PAID")])).toEqual([]);
    expect(tracker.observe("operator:location", [order(orderOneId, "PAID"), order(orderTwoId, "PAID")])).toEqual([
      expect.objectContaining({ id: orderTwoId })
    ]);
  });

  it("alerts when a pending order first becomes actionable", () => {
    const tracker = new NewOrderTracker();

    tracker.observe("operator:location", [order(orderOneId, "PENDING_PAYMENT")]);
    expect(tracker.observe("operator:location", [order(orderOneId, "PAID")])).toEqual([
      expect.objectContaining({ id: orderOneId })
    ]);
    expect(tracker.observe("operator:location", [order(orderOneId, "IN_PREP")])).toEqual([]);
  });

  it("does not alert when the dashboard location changes", () => {
    const tracker = new NewOrderTracker();

    tracker.observe("operator:location-1", []);
    expect(tracker.observe("operator:location-2", [order(orderTwoId, "READY")])).toEqual([]);
  });

  it("enables a suspended audio context and plays a test chime", async () => {
    const start = vi.fn();
    const stop = vi.fn();
    const context = {
      state: "suspended",
      currentTime: 1,
      destination: {},
      resume: vi.fn(async () => {
        context.state = "running";
      }),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      })),
      createOscillator: vi.fn(() => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start,
        stop
      }))
    };
    const AudioContext = vi.fn(function MockAudioContext() {
      return context;
    });
    vi.stubGlobal("window", { AudioContext });

    await expect(enableNewOrderSound()).resolves.toBe(true);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(isNewOrderSoundEnabled()).toBe(true);
  });
});
