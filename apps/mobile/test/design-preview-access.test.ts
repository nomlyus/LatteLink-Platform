import { describe, expect, it } from "vitest";
import { canAccessDesignPreviews } from "../src/dev/previewAccess";
import { designPreviewScenarios, isDesignPreviewScenario, previewOrder } from "../src/dev/designPreviews";
import { readFileSync } from "node:fs";

describe("development design previews", () => {
  it("requires both a development bundle and an explicitly non-production endpoint", () => {
    expect(canAccessDesignPreviews(true, "https://api-dev.nomly.us/v1", "beta")).toBe(true);
    expect(canAccessDesignPreviews(true, "http://localhost:4000/v1", null)).toBe(true);
    expect(canAccessDesignPreviews(false, "https://api-dev.nomly.us/v1", "beta")).toBe(false);
    expect(canAccessDesignPreviews(true, "https://api-dev.nomly.us/v1", "production")).toBe(false);
  });
  it.each(["https://api.nomly.us/v1", "https://api-dev.nomly.us.evil.test/v1", "https://evil.test/api-dev.nomly.us", "http://api-dev.nomly.us/v1", "", "not a URL"])("rejects production, malformed, and lookalike endpoints: %s", (url) => {
    expect(canAccessDesignPreviews(true, url, "beta")).toBe(false);
  });
  it("guards layout, direct preview URLs, and the entry point independently", () => {
    const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    expect(read("app/dev/_layout.tsx")).toContain('if (!designPreviewsEnabled) return <Redirect href="/"');
    for (const file of ["app/dev/index.tsx", "app/dev/[scenario].tsx"]) expect(read(file)).toContain("if (!designPreviewsEnabled) return null");
    expect(read("src/screens/HomeScreen.tsx")).toContain("{designPreviewsEnabled ?");
  });
  it("uses isolated fixtures and never seeds real checkout, query, auth, or cart state", () => {
    const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const file of ["src/dev/designPreviews.ts", "app/dev/[scenario].tsx", "src/dev/ProfileSetupPreview.tsx"]) {
      expect(read(file)).not.toMatch(/apiClient\.|useCheckoutFlow|useCart\(|useAuthSession|setQueryData|setConfirmation|SecureStore|presentPaymentSheet/);
    }
    expect(new Set(designPreviewScenarios.map((scenario) => scenario.id)).size).toBe(designPreviewScenarios.length);
    expect(isDesignPreviewScenario("made-up")).toBe(false);
    expect(previewOrder("tracking-ready").status).toBe("READY");
    expect(previewOrder("refund").refundSummary?.settledAmountCents).toBe(950);
    expect(previewOrder("canceled").refundSummary).toBeUndefined();
  });
});
