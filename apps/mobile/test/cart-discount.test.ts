import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCartDiscount } from "../src/cart/useCartDiscount";
import { createCartItem } from "../src/cart/model";

const runtime = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  effects: [] as (() => void | (() => void))[], quote: vi.fn()
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = runtime.stateIndex++;
    if (!(index in runtime.states)) runtime.states[index] = initial;
    return [runtime.states[index], (value: unknown) => { runtime.states[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = runtime.refIndex++;
    return runtime.refs[index] ?? (runtime.refs[index] = { current: initial });
  },
  useEffect: (effect: () => void | (() => void)) => runtime.effects.push(effect)
}));
vi.mock("../src/api/client", () => ({ apiClient: { quoteOrder: runtime.quote } }));

function context() {
  return {
    items: [createCartItem({ menuItemId: "coffee", itemName: "Coffee", quantity: 1, basePriceCents: 600, customizationGroups: [] })],
    code: "SAVE10", brandId: "brand-1", userId: "user-1", cartLocationId: "location-1", selectedLocationId: "location-1"
  };
}
function quoted() {
  return {
    locationId: "location-1", appliedDiscountCode: { code: "SAVE10", discountCents: 100 },
    subtotal: { amountCents: 600 }, tax: { amountCents: 30 }, discount: { amountCents: 100 }, total: { amountCents: 530 }
  };
}
function render(input = context()) {
  runtime.stateIndex = 0; runtime.refIndex = 0; runtime.effects = [];
  return useCartDiscount(input);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks(); runtime.states = []; runtime.refs = [];
  runtime.quote.mockResolvedValue(quoted());
});

describe("Cart discount validation", () => {
  it("uses the backend's applied code and exact quoted amounts", async () => {
    const input = context();
    await render(input).apply();
    expect(runtime.quote).toHaveBeenCalledWith(expect.objectContaining({ locationId: "location-1", discountCode: "SAVE10", pointsToRedeem: 0 }));
    expect(render(input)).toMatchObject({ applied: true, applying: false, error: undefined, quote: quoted() });
  });
  it("guards duplicate Apply taps while the quote is pending", async () => {
    const pending = deferred<ReturnType<typeof quoted>>(); runtime.quote.mockReturnValue(pending.promise);
    const input = context(); const discount = render(input);
    const first = discount.apply(); await discount.apply();
    expect(runtime.quote).toHaveBeenCalledOnce(); expect(render(input).applying).toBe(true);
    pending.resolve(quoted()); await first;
    expect(render(input).applying).toBe(false);
  });
  it.each(["missing", "wrong-code", "zero", "wrong-location"])("rejects a nonapplicable %s response", async (condition) => {
    const quote = quoted();
    if (condition === "missing") runtime.quote.mockResolvedValue({ ...quote, appliedDiscountCode: undefined });
    if (condition === "wrong-code") runtime.quote.mockResolvedValue({ ...quote, appliedDiscountCode: { code: "OTHER", discountCents: 100 } });
    if (condition === "zero") runtime.quote.mockResolvedValue({ ...quote, appliedDiscountCode: { code: "SAVE10", discountCents: 0 } });
    if (condition === "wrong-location") runtime.quote.mockResolvedValue({ ...quote, locationId: "location-2" });
    await render().apply();
    expect(render()).toMatchObject({ applied: false, quote: undefined, error: "This code doesn’t apply to your cart." });
  });
  it("shows the backend rejection without presenting a discounted total", async () => {
    runtime.quote.mockRejectedValue(new Error('Request failed: {"code":"DISCOUNT_EXPIRED","message":"This code has expired."}'));
    await render().apply();
    expect(render()).toMatchObject({ applied: false, quote: undefined, error: "This code has expired." });
  });
  it("rejects invalid syntax and signed-out requests before calling the API", async () => {
    await render({ ...context(), code: "A" }).apply();
    expect(render({ ...context(), code: "A" }).error).toContain("3–32");
    await render({ ...context(), userId: "" }).apply();
    expect(runtime.quote).not.toHaveBeenCalled();
  });
  it.each(["cart", "code", "location", "customer", "brand"])("ignores a response from an old %s", async (scope) => {
    const pending = deferred<ReturnType<typeof quoted>>(); runtime.quote.mockReturnValue(pending.promise);
    const input = context(); const first = render(input).apply();
    const changed = { ...input };
    if (scope === "cart") changed.items = [];
    if (scope === "code") changed.code = "NEWCODE";
    if (scope === "location") changed.selectedLocationId = "location-2";
    if (scope === "customer") changed.userId = "user-2";
    if (scope === "brand") changed.brandId = "brand-2";
    render(changed); pending.resolve(quoted()); await first;
    expect(render(changed)).toMatchObject({ applied: false, applying: false, quote: undefined });
  });
  it("invalidates a previously accepted quote immediately when quantities change", async () => {
    const input = context(); await render(input).apply();
    const changed = { ...input, items: [{ ...input.items[0], quantity: 2 }] };
    expect(render(changed).quote).toBeUndefined();
  });
  it("does not update disposed state", async () => {
    const pending = deferred<ReturnType<typeof quoted>>(); runtime.quote.mockReturnValue(pending.promise);
    const discount = render(); const dispose = runtime.effects[0]();
    const first = discount.apply(); if (typeof dispose === "function") dispose();
    pending.resolve(quoted()); await first;
    expect(runtime.states[0]).toMatchObject({ pending: true });
  });
});
