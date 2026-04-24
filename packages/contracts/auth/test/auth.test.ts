import { describe, expect, it } from "vitest";
import {
  appleExchangeRequestSchema,
  authSuccessSchema,
  customerProfileRequestSchema,
  googleOAuthStartRequestSchema,
  internalOwnerProvisionRequestSchema,
  internalOwnerProvisionResponseSchema,
  internalOwnerSummarySchema,
  meResponseSchema,
  operatorGoogleExchangeRequestSchema,
  operatorPasswordSignInSchema,
  operatorUserCreateSchema,
  passkeyVerifyRequestSchema
} from "../src";

describe("contracts-auth", () => {
  it("validates apple exchange payload", () => {
    const data = appleExchangeRequestSchema.parse({
      identityToken: "token",
      authorizationCode: "code",
      nonce: "nonce"
    });

    expect(data.authorizationCode).toBe("code");
  });

  it("rejects apple exchange payloads without the Apple tokens", () => {
    expect(() =>
      appleExchangeRequestSchema.parse({
        nonce: "legacy-nonce"
      })
    ).toThrowError();
  });

  it("accepts Google OAuth start payloads", () => {
    const data = googleOAuthStartRequestSchema.parse({
      redirectUri: "http://localhost:5173/?google_auth_callback=1"
    });

    expect(data.redirectUri).toContain("google_auth_callback=1");
  });

  it("accepts operator Google exchange payloads", () => {
    const data = operatorGoogleExchangeRequestSchema.parse({
      code: "google-auth-code",
      state: "signed-state",
      redirectUri: "http://localhost:5173/?google_auth_callback=1"
    });

    expect(data.code).toBe("google-auth-code");
    expect(data.state).toBe("signed-state");
  });

  it("accepts passkey register verify payload", () => {
    const payload = passkeyVerifyRequestSchema.parse({
      id: "credential-id",
      rawId: "raw-credential-id",
      type: "public-key",
      response: {
        clientDataJSON: "base64-client-data",
        attestationObject: "base64-attestation-object"
      }
    });

    expect(payload.type).toBe("public-key");
    expect(payload.response.attestationObject).toBeDefined();
  });

  it("accepts passkey auth verify payload", () => {
    const payload = passkeyVerifyRequestSchema.parse({
      id: "credential-id",
      rawId: "raw-credential-id",
      type: "public-key",
      response: {
        clientDataJSON: "base64-client-data",
        authenticatorData: "base64-authenticator-data",
        signature: "base64-signature"
      }
    });

    expect(payload.response.signature).toBeDefined();
  });

  it("rejects passkey verify payload without attestation or assertion fields", () => {
    expect(() =>
      passkeyVerifyRequestSchema.parse({
        id: "credential-id",
        rawId: "raw-credential-id",
        type: "public-key",
        response: {
          clientDataJSON: "base64-client-data"
        }
      })
    ).toThrowError();
  });

  it("accepts operator password sign-in payloads", () => {
    const payload = operatorPasswordSignInSchema.parse({
      email: " owner@gazellecoffee.com ",
      password: "Password123!"
    });

    expect(payload.email).toBe("owner@gazellecoffee.com");
    expect(payload.password).toBe("Password123!");
  });

  it("accepts me responses with optional customer profile fields", () => {
    const payload = meResponseSchema.parse({
      userId: "123e4567-e89b-12d3-a456-426614174000",
      email: "member@example.com",
      name: "Avery Quinn",
      displayName: "Avery Quinn",
      phoneNumber: "+13135550123",
      birthday: "1992-04-12",
      profileCompleted: true,
      memberSince: "2026-04-01T00:00:00.000Z",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      methods: ["apple", "passkey"]
    });

    expect(payload.name).toBe("Avery Quinn");
    expect(payload.displayName).toBe("Avery Quinn");
    expect(payload.phoneNumber).toBe("+13135550123");
    expect(payload.birthday).toBe("1992-04-12");
    expect(payload.profileCompleted).toBe(true);
    expect(payload.methods).toEqual(["apple", "passkey"]);
  });

  it("validates customer profile completion payloads", () => {
    const payload = customerProfileRequestSchema.parse({
      name: " Avery Quinn ",
      displayName: " Avery Quinn ",
      phoneNumber: " +13135550123 ",
      birthday: "1992-04-12"
    });

    expect(payload).toEqual({
      name: "Avery Quinn",
      phoneNumber: "+13135550123",
      birthday: "1992-04-12"
    });
  });

  it("accepts generic auth success responses", () => {
    const payload = authSuccessSchema.parse({
      success: true
    });

    expect(payload.success).toBe(true);
  });

  it("requires passwords when creating operator users", () => {
    const payload = operatorUserCreateSchema.parse({
      displayName: " Avery Quinn ",
      email: " avery@store.com ",
      role: "manager",
      password: "Password123!"
    });

    expect(payload.displayName).toBe("Avery Quinn");
    expect(payload.email).toBe("avery@store.com");
  });

  it("validates internal owner provisioning payloads", () => {
    const request = internalOwnerProvisionRequestSchema.parse({
      displayName: " Pilot Owner ",
      email: " owner@northside.com ",
      dashboardUrl: "https://client.example.com"
    });

    const response = internalOwnerProvisionResponseSchema.parse({
      operator: {
        operatorUserId: "123e4567-e89b-12d3-a456-426614174000",
        displayName: "Pilot Owner",
        email: "owner@northside.com",
        role: "owner",
        locationId: "northside-01",
        active: true,
        capabilities: [
          "orders:read",
          "orders:write",
          "menu:read",
          "menu:write",
          "menu:visibility",
          "store:read",
          "store:write",
          "team:read",
          "team:write"
        ],
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      },
      temporaryPassword: "Temporary123!",
      action: "created"
    });

    expect(request.email).toBe("owner@northside.com");
    expect(response.operator.role).toBe("owner");

    const summary = internalOwnerSummarySchema.parse({
      locationId: "northside-01",
      owner: response.operator
    });

    expect(summary.owner?.email).toBe("owner@northside.com");
  });
});
