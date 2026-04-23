import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  buildOperatorHeaders,
  extractApiErrorMessage,
  isApiRequestError,
  normalizeApiBaseUrl,
  signInOperatorWithPassword
} from "../src/api";

describe("client dashboard api helpers", () => {
  it("normalizes operator api base URLs onto /v1", () => {
    expect(normalizeApiBaseUrl("")).toBe("");
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

  it("identifies typed API request errors for auth handling", () => {
    const error = new ApiRequestError("Request failed (401)", 401, { message: "Unauthorized" });

    expect(isApiRequestError(error)).toBe(true);
    expect(isApiRequestError(new Error("plain error"))).toBe(false);
    expect(error.statusCode).toBe(401);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a stable backend reachability error when the api base URL is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      signInOperatorWithPassword({
        apiBaseUrl: "",
        email: "owner@store.com",
        password: "password123"
      })
    ).rejects.toThrow("Unable to reach backend.");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws a stable backend reachability error when fetch fails", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      signInOperatorWithPassword({
        apiBaseUrl: "https://api.nomly.us",
        email: "owner@store.com",
        password: "password123"
      })
    ).rejects.toThrow("Unable to reach backend.");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.nomly.us/v1/operator/auth/sign-in",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
