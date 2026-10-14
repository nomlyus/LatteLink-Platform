import { describe, expect, it } from "vitest";
import { taxPercentToBasisPoints } from "../src/features/onboarding/owner-input-domain";
describe("owner tax entry", () => {
  it.each([["0", 0], ["6", 600], ["6.25", 625], ["8.1", 810], ["100", 10000]])("converts %s exactly", (input, expected) => expect(taxPercentToBasisPoints(input)).toBe(expected));
  it.each(["", "-1", "100.01", "6.255", "6e1", "NaN", "6%"])("rejects %s", (input) => expect(() => taxPercentToBasisPoints(input)).toThrow());
});
