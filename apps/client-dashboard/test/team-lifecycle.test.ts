import { describe, expect, it } from "vitest";
import { createTeamMutationGate, createTeamRequestLifecycle } from "../src/features/team/team-lifecycle";

describe("Team request and mutation lifecycle", () => {
  it("aborts obsolete loads and only accepts the latest request", () => {
    const lifecycle = createTeamRequestLifecycle();
    const first = lifecycle.begin();
    const second = lifecycle.begin();
    expect(first.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(first)).toBe(false);
    expect(lifecycle.isCurrent(second)).toBe(true);
    lifecycle.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
    expect(lifecycle.isCurrent(second)).toBe(false);
  });

  it("makes writes single-flight until the active mutation releases", () => {
    const gate = createTeamMutationGate();
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.release();
    expect(gate.begin()).toBe(true);
  });
});
