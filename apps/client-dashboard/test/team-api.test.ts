import { afterEach, describe, expect, it, vi } from "vitest";
import { createOperatorTeamMember, deleteOperatorTeamMember, fetchOperatorTeam, updateOperatorTeamMember } from "../src/features/team/team-api";
import type { OperatorSession } from "../src/api";

const session: OperatorSession = {
  apiBaseUrl: "https://api-dev.nomly.us/v1",
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: "2026-09-30T10:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Store Owner",
    email: "owner@example.com",
    role: "owner",
    locationId: "location-a",
    locationIds: ["location-a"],
    active: true,
    capabilities: ["team:read", "team:write"],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z"
  }
};

const member = {
  operatorUserId: "22222222-2222-4222-8222-222222222222",
  displayName: "Avery Quinn",
  email: "avery@example.com",
  role: "manager",
  locationId: "location-a",
  locationIds: ["location-a"],
  active: true,
  capabilities: ["team:read"],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z"
};

afterEach(() => vi.unstubAllGlobals());

describe("Team API", () => {
  it("loads users for one selected location and forwards request cancellation", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ users: [member] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const controller = new AbortController();

    await expect(fetchOperatorTeam(session, "location-a", controller.signal)).resolves.toMatchObject([{ email: "avery@example.com" }]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api-dev.nomly.us/v1/admin/staff?locationId=location-a",
      expect.objectContaining({ signal: controller.signal, headers: { authorization: "Bearer test-access-token" } })
    );
    expect(() => fetchOperatorTeam(session, "all")).toThrow("Choose one location");
  });

  it("creates, updates, and deletes accounts through the shared authenticated transport", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(member), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...member, displayName: "Avery Q." }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(createOperatorTeamMember(session, "location-a", {
      displayName: "Avery Quinn", email: "avery@example.com", role: "manager", password: "password-123"
    })).resolves.toMatchObject({ operatorUserId: member.operatorUserId });
    await expect(updateOperatorTeamMember(session, "location-a", member.operatorUserId, { displayName: "Avery Q." })).resolves.toMatchObject({ displayName: "Avery Q." });
    await expect(deleteOperatorTeamMember(session, "location-a", member.operatorUserId)).resolves.toEqual({ success: true });

    expect(fetchSpy.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
      ["https://api-dev.nomly.us/v1/admin/staff?locationId=location-a", "POST"],
      [`https://api-dev.nomly.us/v1/admin/staff/${member.operatorUserId}?locationId=location-a`, "PATCH"],
      [`https://api-dev.nomly.us/v1/admin/staff/${member.operatorUserId}?locationId=location-a`, "DELETE"]
    ]);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer test-access-token", "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Avery Quinn", email: "avery@example.com", role: "manager", password: "password-123" })
    });
  });
});
