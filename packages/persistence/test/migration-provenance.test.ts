import { describe, expect, it } from "vitest";
import { summarizeMigrationHistory } from "../src/migrate.js";

describe("migration provenance", () => {
  it("reports actual applied and pending history, including an empty database", () => {
    expect(summarizeMigrationHistory([])).toEqual({
      latestApplied: null,
      appliedCount: 0,
      pendingCount: 0,
    });
    expect(summarizeMigrationHistory([
      { name: "0001_initial_schema", executedAt: new Date("2026-09-01") },
      { name: "0002_next", executedAt: new Date("2026-09-02") },
      { name: "0003_pending", executedAt: undefined },
    ])).toEqual({
      latestApplied: "0002_next",
      appliedCount: 2,
      pendingCount: 1,
    });
  });
});
