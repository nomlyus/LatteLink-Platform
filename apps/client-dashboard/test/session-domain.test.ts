import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../src/api";
import { createSessionRestoreCoordinator, isCurrentSessionOperation, restorePersistedSession } from "../src/features/auth/session-domain";
import type { OperatorSession } from "../src/features/auth/auth-types";

const validSession: OperatorSession = {
  apiBaseUrl: "https://api-dev.example.test/v1",
  accessToken: "access-placeholder",
  refreshToken: "refresh-placeholder",
  expiresAt: "2030-01-01T00:00:00.000Z",
  operator: {
    operatorUserId: "11111111-1111-4111-8111-111111111111",
    displayName: "Operator",
    email: "operator@example.test",
    role: "owner",
    locationId: "location-a",
    locationIds: ["location-a"],
    active: true,
    capabilities: ["store:read"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

describe("React session lifecycle domain", () => {
  it("keeps a fresh restored session without an unnecessary refresh", async () => {
    const refresh = vi.fn();
    const result = await restorePersistedSession(validSession, refresh, Date.parse("2026-01-01T00:00:00.000Z"));
    expect(result).toEqual({ session: validSession, invalid: false, remoteRevocationRequired: false });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes a near-expiry session before exposing it as restored", async () => {
    const expiring = { ...validSession, expiresAt: "2026-01-01T00:00:30.000Z" };
    const refreshed = { ...validSession, accessToken: "new-access-placeholder", expiresAt: "2026-01-02T00:00:00.000Z" };
    const refresh = vi.fn().mockResolvedValue(refreshed);
    expect(await restorePersistedSession(expiring, refresh, Date.parse("2026-01-01T00:00:00.000Z")))
      .toEqual({ session: refreshed, invalid: false, remoteRevocationRequired: false });
    expect(refresh).toHaveBeenCalledWith(expiring);
  });

  it("shares an in-flight initial refresh across Strict Mode effect replay", async () => {
    const expiring = { ...validSession, expiresAt: "2026-01-01T00:00:30.000Z" };
    let resolveRefresh: ((session: OperatorSession) => void) | undefined;
    const refresh = vi.fn(() => new Promise<OperatorSession>((resolve) => { resolveRefresh = resolve; }));
    const restoreOnce = createSessionRestoreCoordinator();

    const firstRestore = restoreOnce(expiring, refresh);
    const replayedRestore = restoreOnce(expiring, refresh);

    expect(replayedRestore).toBe(firstRestore);
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh?.({ ...validSession, accessToken: "rotated-access-placeholder", refreshToken: "rotated-refresh-placeholder" });
    await expect(replayedRestore).resolves.toMatchObject({ invalid: false, remoteRevocationRequired: false });

    const retriedRestore = restoreOnce(expiring, refresh);
    expect(retriedRestore).not.toBe(firstRestore);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("rejects an expired session after an authorization failure and requests remote revocation", async () => {
    const expired = { ...validSession, expiresAt: "2020-01-01T00:00:00.000Z" };
    const refresh = vi.fn().mockRejectedValue(new ApiRequestError("Unauthorized", 401, {}));
    expect(await restorePersistedSession(expired, refresh, Date.parse("2026-01-01T00:00:00.000Z")))
      .toEqual({ session: null, invalid: true, remoteRevocationRequired: true });
  });

  it("does not discard a still-valid session when refresh is temporarily unavailable", async () => {
    const expiring = { ...validSession, expiresAt: "2026-01-01T00:00:30.000Z" };
    const refresh = vi.fn().mockRejectedValue(new Error("Unable to reach backend."));
    expect(await restorePersistedSession(expiring, refresh, Date.parse("2026-01-01T00:00:00.000Z")))
      .toEqual({ session: expiring, invalid: false, remoteRevocationRequired: false });
  });

  it("rejects asynchronous results from a prior session revision", () => {
    expect(isCurrentSessionOperation(3, 3, "refresh-placeholder", validSession)).toBe(true);
    expect(isCurrentSessionOperation(3, 4, "refresh-placeholder", validSession)).toBe(false);
    expect(isCurrentSessionOperation(3, 3, "old-refresh", validSession)).toBe(false);
    expect(isCurrentSessionOperation(3, 3, "refresh-placeholder", null)).toBe(false);
  });
});
