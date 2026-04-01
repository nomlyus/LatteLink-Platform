import { describe, expect, it } from "vitest";
import {
  buildOperatorHeaders,
  extractApiErrorMessage,
  normalizeApiBaseUrl
} from "../src/api";

describe("operator-web api helpers", () => {
  it("normalizes operator api base URLs onto /v1", () => {
    expect(normalizeApiBaseUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080/v1");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8080/")).toBe("http://127.0.0.1:8080/v1");
    expect(normalizeApiBaseUrl("http://127.0.0.1:8080/v1")).toBe("http://127.0.0.1:8080/v1");
  });

  it("builds bearer headers for authenticated operator requests", () => {
    expect(buildOperatorHeaders("operator-access-token", true)).toEqual({
      authorization: "Bearer operator-access-token",
      "content-type": "application/json"
    });

    expect(buildOperatorHeaders("operator-access-token", false)).toEqual({
      authorization: "Bearer operator-access-token"
    });
  });

  it("prefers upstream error messages when present", () => {
    expect(extractApiErrorMessage({ message: "Gateway token is invalid" }, 401)).toBe("Gateway token is invalid");
    expect(extractApiErrorMessage({}, 503)).toBe("Request failed (503)");
  });
});
