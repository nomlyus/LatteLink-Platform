import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/nextjs";
import { scrubInviteDetails } from "../src/sentry-scrub";

describe("dashboard Sentry invite scrubbing", () => {
  it("redacts token values and invite URLs throughout event fields", () => {
    const event = scrubInviteDetails({
      request: {
        url: "https://client.example.com/invites/synthetic-secret#synthetic-secret",
        data: { token: "synthetic-secret", password: "temporary-password" }
      },
      transaction: "/invites/synthetic-secret",
      breadcrumbs: [{ data: { url: "/v1/operator/invites/synthetic-secret/accept", to: "?inviteToken=synthetic-secret" } }],
      extra: { error: "lookup failed at /v1/operator/invites/synthetic-secret" }
    } as unknown as Event);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain("temporary-password");
    expect(event.request?.url).toBe("https://client.example.com/invites/[redacted]");
  });
});
