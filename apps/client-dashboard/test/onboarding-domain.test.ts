import { describe, expect, it } from "vitest";
import { isOnboardingIncomplete } from "../src/features/onboarding/onboarding-domain";

describe("onboarding readiness domain", () => {
  it.each(["in_progress", "ready_for_review"])("treats %s as incomplete", (status) => {
    expect(isOnboardingIncomplete(status)).toBe(true);
  });

  it.each(["approved", "live"])("treats %s as complete", (status) => {
    expect(isOnboardingIncomplete(status)).toBe(false);
  });
});
