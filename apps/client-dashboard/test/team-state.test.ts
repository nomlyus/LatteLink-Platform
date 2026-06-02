import { describe, expect, it } from "vitest";
import { replaceTeamUser } from "../src/team-state";
import type { OperatorUser } from "../src/api";

const baseUser: OperatorUser = {
  operatorUserId: "11111111-1111-4111-8111-111111111111",
  displayName: "Original Name",
  email: "owner@example.com",
  role: "owner",
  locationId: "rawaqcoffee01",
  locationIds: ["rawaqcoffee01"],
  active: true,
  capabilities: ["team:read", "team:write"],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z"
};

describe("team state helpers", () => {
  it("replaces an updated team member without changing other entries", () => {
    const otherUser: OperatorUser = {
      ...baseUser,
      operatorUserId: "22222222-2222-4222-8222-222222222222",
      displayName: "Other User",
      email: "other@example.com"
    };
    const updatedUser: OperatorUser = {
      ...baseUser,
      displayName: "Updated Name",
      updatedAt: "2026-06-01T00:10:00.000Z"
    };

    expect(replaceTeamUser([baseUser, otherUser], updatedUser)).toEqual([updatedUser, otherUser]);
  });
});
