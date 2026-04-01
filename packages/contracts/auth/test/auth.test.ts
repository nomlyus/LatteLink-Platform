import { describe, expect, it } from "vitest";
import {
  appleExchangeRequestSchema,
  magicLinkRequestSchema,
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

  it("accepts legacy apple exchange payloads that only provide nonce", () => {
    const data = appleExchangeRequestSchema.parse({
      nonce: "legacy-nonce"
    });

    expect(data.nonce).toBe("legacy-nonce");
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

  it("trims magic-link email input before validation", () => {
    const payload = magicLinkRequestSchema.parse({
      email: " owner@gazellecoffee.com "
    });

    expect(payload.email).toBe("owner@gazellecoffee.com");
  });

  it("accepts operator password sign-in payloads", () => {
    const payload = operatorPasswordSignInSchema.parse({
      email: " owner@gazellecoffee.com ",
      password: "Password123!"
    });

    expect(payload.email).toBe("owner@gazellecoffee.com");
    expect(payload.password).toBe("Password123!");
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
});
