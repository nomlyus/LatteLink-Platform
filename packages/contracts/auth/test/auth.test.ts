import { describe, expect, it } from "vitest";
import { appleExchangeRequestSchema, passkeyVerifyRequestSchema } from "../src";

describe("contracts-auth", () => {
  it("validates apple exchange payload", () => {
    const data = appleExchangeRequestSchema.parse({
      identityToken: "token",
      authorizationCode: "code",
      nonce: "nonce"
    });

    expect(data.authorizationCode).toBe("code");
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
});
