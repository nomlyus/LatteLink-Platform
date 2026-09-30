import { describe, expect, it } from "vitest";
import { createOnboardingMutationGate, createOnboardingRequestLifecycle } from "../src/features/onboarding/onboarding-lifecycle";

describe("React Onboarding request and mutation lifecycle", () => {
  it("aborts superseded requests and ignores stale completions", () => {
    const lifecycle = createOnboardingRequestLifecycle();
    const first = lifecycle.begin();
    const second = lifecycle.begin();

    expect(first.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(first)).toBe(false);
    expect(lifecycle.isCurrent(second)).toBe(true);

    lifecycle.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(second)).toBe(false);
  });

  it("allows only one sensitive mutation until the active operation releases", () => {
    const gate = createOnboardingMutationGate();
    expect(gate.begin()).toBe(true);
    expect(gate.isActive()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.release();
    expect(gate.isActive()).toBe(false);
    expect(gate.begin()).toBe(true);
  });
});
