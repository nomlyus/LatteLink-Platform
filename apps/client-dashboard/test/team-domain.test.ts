import { describe, expect, it } from "vitest";
import { resolveOperatorCapabilities, type OperatorUser } from "@lattelink/contracts-auth";
import {
  buildTeamMemberUpdate,
  canDeleteTeamMember,
  canReadTeam,
  canWriteTeam,
  getAdditionalTeamLocationCount,
  getTeamMemberLocationNames,
  getTeamScopeKey,
  requiresTeamAccessConfirmation,
  validateTeamCreateDraft
} from "../src/features/team/team-domain";

const owner: OperatorUser = {
  operatorUserId: "11111111-1111-4111-8111-111111111111",
  displayName: "Store Owner",
  email: "owner@example.com",
  role: "owner",
  locationId: "location-a",
  locationIds: ["location-a", "location-b"],
  active: true,
  capabilities: [...resolveOperatorCapabilities("owner")],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z"
};

const manager: OperatorUser = {
  ...owner,
  operatorUserId: "22222222-2222-4222-8222-222222222222",
  displayName: "Store Manager",
  email: "manager@example.com",
  role: "manager",
  capabilities: [...resolveOperatorCapabilities("manager")]
};

describe("Team domain rules", () => {
  it("uses server-issued capabilities for read, write, and delete affordances", () => {
    expect(canReadTeam(owner)).toBe(true);
    expect(canWriteTeam(owner)).toBe(true);
    expect(canReadTeam(manager)).toBe(true);
    expect(canWriteTeam(manager)).toBe(false);
    expect(canDeleteTeamMember(owner, manager)).toBe(true);
    expect(canDeleteTeamMember(owner, owner)).toBe(false);
    expect(canDeleteTeamMember(manager, owner)).toBe(false);
    expect(canReadTeam({ capabilities: [...resolveOperatorCapabilities("store")] })).toBe(false);
  });

  it("validates direct account creation and trims identity fields and temporary passwords", () => {
    expect(validateTeamCreateDraft({
      displayName: "  Avery Quinn ",
      email: " avery@example.com ",
      role: "manager",
      password: "  password-123  "
    })).toMatchObject({
      success: true,
      data: { displayName: "Avery Quinn", email: "avery@example.com", role: "manager", password: "password-123" }
    });
    expect(validateTeamCreateDraft({ displayName: "", email: "bad", role: "store", password: "short" }).success).toBe(false);
  });

  it("omits an unchanged owner role because Identity rejects owner in update payloads", () => {
    const patch = buildTeamMemberUpdate(owner, {
      displayName: "Store Owner",
      email: "owner@example.com",
      role: "owner",
      active: true,
      password: ""
    });
    expect(patch).toBeNull();

    const profilePatch = buildTeamMemberUpdate(owner, {
      displayName: "Updated Owner",
      email: "owner@example.com",
      role: "owner",
      active: true,
      password: ""
    });
    expect(profilePatch).toEqual({ displayName: "Updated Owner" });
    expect(profilePatch).not.toHaveProperty("role");
  });

  it("allows supported role demotion and confirms changes that reduce access", () => {
    const draft = { displayName: manager.displayName, email: manager.email, role: "store" as const, active: true, password: "" };
    expect(buildTeamMemberUpdate(manager, draft)).toEqual({ role: "store" });
    expect(requiresTeamAccessConfirmation(owner, { ...draft, role: "manager" })).toBe(true);
    expect(requiresTeamAccessConfirmation(manager, draft)).toBe(true);
    expect(requiresTeamAccessConfirmation({ ...manager, active: true }, { ...draft, active: false })).toBe(true);
    expect(requiresTeamAccessConfirmation({ ...manager, role: "store", capabilities: [...resolveOperatorCapabilities("store")] }, { ...draft, role: "manager" })).toBe(false);
  });

  it("distinguishes the selected location scope and maps only authorized names for multi-location accounts", () => {
    expect(getTeamScopeKey(owner.operatorUserId, "location-a", owner.capabilities)).not.toBe(
      getTeamScopeKey(owner.operatorUserId, "location-b", owner.capabilities)
    );
    expect(getTeamScopeKey(owner.operatorUserId, "location-a", owner.capabilities)).not.toBe(
      getTeamScopeKey(owner.operatorUserId, "location-a", manager.capabilities)
    );
    const authorized = [{ locationId: "location-a", locationName: "Main Street" }];
    expect(getTeamMemberLocationNames(owner, authorized)).toEqual(["Main Street"]);
    expect(getAdditionalTeamLocationCount(owner, authorized)).toBe(1);
  });
});
