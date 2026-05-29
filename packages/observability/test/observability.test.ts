import { describe, expect, it } from "vitest";
import { sanitizeRequestUrl } from "../src/index.js";

describe("observability helpers", () => {
  it("removes query strings from logged request URLs", () => {
    expect(sanitizeRequestUrl("/v1/internal/support/orders?query=avery@example.com&locationId=flagship-01")).toBe(
      "/v1/internal/support/orders"
    );
    expect(sanitizeRequestUrl("https://api.example.com/v1/orders?phone=%2B13135550123")).toBe(
      "https://api.example.com/v1/orders"
    );
  });

  it("preserves URLs without query strings", () => {
    expect(sanitizeRequestUrl("/ready")).toBe("/ready");
    expect(sanitizeRequestUrl(undefined)).toBeUndefined();
  });
});
