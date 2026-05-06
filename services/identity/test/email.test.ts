import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmailProvider,
  EmailConfigurationError,
  EmailDeliveryError,
  resolveClientDashboardBaseUrl
} from "../src/email.js";

describe("identity email provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the console provider as a local/dev fallback", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const provider = createEmailProvider({ EMAIL_PROVIDER: "console" });

    await provider.sendOwnerInvite({
      to: "owner@example.com",
      displayName: "Pilot Owner",
      inviteUrl: "https://client.example.com/invites/token",
      locationId: "pilot-01"
    });

    expect(info).toHaveBeenCalledWith(
      "[identity-email] owner invite",
      expect.objectContaining({
        to: "owner@example.com",
        inviteUrl: "https://client.example.com/invites/token"
      })
    );
  });

  it("requires production Resend configuration", () => {
    expect(() => createEmailProvider({ EMAIL_PROVIDER: "resend" })).toThrow(EmailConfigurationError);
  });

  it("sends owner invite emails through Resend", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createEmailProvider({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "resend-key",
      OWNER_INVITE_EMAIL_FROM: "Nomly <onboarding@example.com>"
    });

    await provider.sendOwnerInvite({
      to: "owner@example.com",
      displayName: "Pilot Owner",
      inviteUrl: "https://client.example.com/invites/token",
      locationId: "pilot-01"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer resend-key"
        })
      })
    );
  });

  it("surfaces provider delivery failures", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 })));
    const provider = createEmailProvider({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "resend-key",
      OWNER_INVITE_EMAIL_FROM: "Nomly <onboarding@example.com>"
    });

    await expect(
      provider.sendOwnerInvite({
        to: "owner@example.com",
        displayName: "Pilot Owner",
        inviteUrl: "https://client.example.com/invites/token",
        locationId: "pilot-01"
      })
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("resolves the client dashboard base URL from env", () => {
    expect(resolveClientDashboardBaseUrl({ CLIENT_DASHBOARD_BASE_URL: " https://client.example.com " })).toBe(
      "https://client.example.com"
    );
  });
});
