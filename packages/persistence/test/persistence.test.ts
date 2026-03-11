import { describe, expect, it } from "vitest";
import { getDatabaseUrl } from "../src/index.js";

describe("persistence", () => {
  it("returns undefined when DATABASE_URL is missing", () => {
    expect(getDatabaseUrl({})).toBeUndefined();
  });

  it("returns trimmed DATABASE_URL", () => {
    expect(getDatabaseUrl({ DATABASE_URL: "  postgres://localhost:5432/gazelle  " })).toBe(
      "postgres://localhost:5432/gazelle"
    );
  });
});
