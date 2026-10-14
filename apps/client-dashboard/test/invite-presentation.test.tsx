import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { operatorInviteLookupResponseSchema } from "@lattelink/contracts-auth";
import { InviteAcceptancePage } from "../src/features/invites/components/InviteAcceptancePage";

const lookup = operatorInviteLookupResponseSchema.parse({
  operator: { displayName: "Test Owner", email: "owner@example.test", role: "owner", locationId: "test" },
  invite: { inviteId: "11111111-1111-4111-8111-111111111111", operatorUserId: "22222222-2222-4222-8222-222222222222", locationId: "test", email: "owner@example.test", status: "pending", expiresAt: "2027-01-01T00:00:00.000Z", createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z" }
});
describe("V3 invitation presentation", () => {
  it("uses the provisioned identity and preserves password confirmation", () => {
    const html = renderToStaticMarkup(<InviteAcceptancePage status="ready" lookup={lookup} error={null} onAccept={vi.fn()} />);
    expect(html).toContain("Join your team.");
    expect(html).toContain('readOnly=""');
    expect(html).toContain("Confirm password");
    expect(html).toContain("Accept invitation");
  });
  it("shows pending and failure states without false activation", () => {
    const pending = renderToStaticMarkup(<InviteAcceptancePage status="accepting" lookup={lookup} error={null} onAccept={vi.fn()} />);
    expect(pending).toContain("Activating account…");
    expect(pending).toContain('disabled=""');
    const invalid = renderToStaticMarkup(<InviteAcceptancePage status="invalid" lookup={null} error="Expired invitation" onAccept={vi.fn()} />);
    expect(invalid).toContain('role="alert"');
    expect(invalid).toContain("Go to sign in");
    expect(invalid).not.toContain('autoComplete="new-password"');
  });
});
