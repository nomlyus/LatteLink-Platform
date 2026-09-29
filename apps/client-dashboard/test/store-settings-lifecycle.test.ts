import { describe, expect, it } from "vitest";
import { createStoreSettingsMutationGate, createStoreSettingsRequestLifecycle } from "../src/features/settings/store-settings-lifecycle";

describe("store settings request lifecycle", () => {
  it("aborts a stale location request and rejects callbacks after unmount invalidation", () => {
    const lifecycle = createStoreSettingsRequestLifecycle();
    const locationA = lifecycle.begin();
    const locationB = lifecycle.begin();

    expect(locationA.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(locationA)).toBe(false);
    expect(lifecycle.isCurrent(locationB)).toBe(true);

    lifecycle.invalidate();
    expect(locationB.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(locationB)).toBe(false);
  });

  it("allows only one store-config mutation at a time", () => {
    const gate = createStoreSettingsMutationGate();
    expect(gate.begin()).toBe(true);
    expect(gate.isActive()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.release();
    expect(gate.isActive()).toBe(false);
    expect(gate.begin()).toBe(true);
  });
});
