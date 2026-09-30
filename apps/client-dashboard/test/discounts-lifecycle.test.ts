import { describe, expect, it } from "vitest";
import { createDiscountMutationGate, createDiscountsRequestLifecycle } from "../src/features/discounts/discounts-lifecycle";

describe("Discounts lifecycle guards", () => {
  it("aborts a superseded request and ignores disposed request results", () => {
    const lifecycle = createDiscountsRequestLifecycle();
    const first = lifecycle.begin();
    const second = lifecycle.begin();

    expect(first.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(first)).toBe(false);
    expect(lifecycle.isCurrent(second)).toBe(true);

    lifecycle.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(second)).toBe(false);
  });

  it("allows only one discount mutation at a time", () => {
    const gate = createDiscountMutationGate();
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.release();
    expect(gate.begin()).toBe(true);
  });
});
