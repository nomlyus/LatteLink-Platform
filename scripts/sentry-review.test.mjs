import { describe, expect, it } from "vitest";
import { reviewSentryIssues } from "./sentry-review.mjs";

describe("Sentry production review", () => {
  it("lists issues for each configured project with bearer authentication", async () => {
    const requests = [];
    const results = await reviewSentryIssues({
      token: "sentry-token",
      org: "nomly",
      projects: ["lattelink-gateway", "lattelink-mobile"],
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify([{ shortId: "NOMLY-1", title: "Checkout timeout" }]), { status: 200 });
      }
    });

    expect(results).toHaveLength(2);
    expect(results[0].issues[0].shortId).toBe("NOMLY-1");
    expect(requests[0].init.headers.authorization).toBe("Bearer sentry-token");
    expect(requests[0].url).toContain("query=is%3Aunresolved");
  });

  it("fails clearly when access is not configured", async () => {
    await expect(
      reviewSentryIssues({ token: "", org: "nomly", projects: ["lattelink-gateway"] })
    ).rejects.toThrow("SENTRY_AUTH_TOKEN is required");
  });
});
