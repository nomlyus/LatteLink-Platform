import { describe, expect, it } from "vitest";
import { DEFAULT_PLATFORM_DISPLAY_NAME, resolveDisplayName } from "../src/brand";

describe("mobile display-name fallback", () => {
  it("uses Nomly when no merchant-specific display name is supplied", () => {
    expect(resolveDisplayName()).toBe(DEFAULT_PLATFORM_DISPLAY_NAME);
    expect(resolveDisplayName(" ")).toBe(DEFAULT_PLATFORM_DISPLAY_NAME);
  });

  it("preserves merchant-specific display names ahead of the platform fallback", () => {
    expect(resolveDisplayName("Rawaq Coffee")).toBe("Rawaq Coffee");
    expect(resolveDisplayName(" ", "Rawaq Coffee")).toBe("Rawaq Coffee");
  });
});
