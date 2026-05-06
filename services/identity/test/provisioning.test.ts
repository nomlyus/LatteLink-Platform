import { describe, expect, it } from "vitest";
import { createInMemoryIdentityRepository } from "../src/repository.js";
import {
  parseOwnerProvisioningArgs,
  provisionOwnerAccess
} from "../src/provisioning.js";
import {
  acceptOwnerInvite,
  createOwnerInvite,
  hashOwnerInviteToken,
  lookupOwnerInvite,
  OwnerInviteError
} from "../src/invites.js";

describe("owner provisioning", () => {
  it("parses provisioning CLI arguments", () => {
    expect(
      parseOwnerProvisioningArgs([
        "--",
        "--display-name",
        "Avery Quinn",
        "--email",
        "avery@store.com",
        "--location-id",
        "flagship-01",
        "--dashboard-url=https://client.example.com"
      ])
    ).toEqual({
      allowInMemory: false,
      dashboardUrl: "https://client.example.com",
      displayName: "Avery Quinn",
      email: "avery@store.com",
      locationId: "flagship-01"
    });
  });

  it("creates a new owner with a generated temporary password", async () => {
    const repository = createInMemoryIdentityRepository();

    const result = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Avery Quinn",
      email: "avery@store.com",
      locationId: "flagship-01"
    });

    expect(result.action).toBe("created");
    expect(result.operator.role).toBe("owner");
    expect(result.operator.locationId).toBe("flagship-01");
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    await expect(repository.verifyOperatorPassword("avery@store.com", result.temporaryPassword)).resolves.toMatchObject({
      email: "avery@store.com",
      role: "owner"
    });

    await repository.close();
  });

  it("updates an existing user into owner access and rotates the password", async () => {
    const repository = createInMemoryIdentityRepository();

    const initial = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Jordan Staff",
      email: "jordan@store.com",
      locationId: "old-location",
      password: "InitialPassword123!"
    });

    const reprovisioned = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Jordan Owner",
      email: "jordan@store.com",
      locationId: "flagship-01",
      password: "ResetPassword456!"
    });

    expect(initial.action).toBe("created");
    expect(reprovisioned.action).toBe("updated");
    expect(reprovisioned.operator.displayName).toBe("Jordan Owner");
    expect(reprovisioned.operator.locationId).toBe("flagship-01");
    expect(reprovisioned.operator.locationIds).toEqual(expect.arrayContaining(["old-location", "flagship-01"]));
    expect(reprovisioned.operator.role).toBe("owner");
    await expect(repository.listOperatorUsers("old-location")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "jordan@store.com" })])
    );
    await expect(repository.verifyOperatorPassword("jordan@store.com", "InitialPassword123!")).resolves.toBeUndefined();
    await expect(repository.verifyOperatorPassword("jordan@store.com", "ResetPassword456!")).resolves.toMatchObject({
      email: "jordan@store.com",
      role: "owner"
    });

    await repository.close();
  });

  it("updates the existing location owner when the email is corrected", async () => {
    const repository = createInMemoryIdentityRepository();

    const initial = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Rawaq Owner",
      email: "wrong@rawaq.com",
      locationId: "rawaqcoffee01",
      password: "InitialPassword123!"
    });

    const corrected = await provisionOwnerAccess(repository, {
      allowInMemory: true,
      displayName: "Rawaq Owner",
      email: "owner@rawaq.com",
      locationId: "rawaqcoffee01",
      password: "CorrectedPassword456!"
    });

    expect(initial.action).toBe("created");
    expect(corrected.action).toBe("updated");
    expect(corrected.operator.operatorUserId).toBe(initial.operator.operatorUserId);
    expect(corrected.operator.email).toBe("owner@rawaq.com");
    expect(corrected.operator.locationId).toBe("rawaqcoffee01");
    expect((await repository.listOperatorUsers("rawaqcoffee01")).filter((operator) => operator.role === "owner")).toHaveLength(1);
    await expect(repository.verifyOperatorPassword("wrong@rawaq.com", "InitialPassword123!")).resolves.toBeUndefined();
    await expect(repository.verifyOperatorPassword("owner@rawaq.com", "CorrectedPassword456!")).resolves.toMatchObject({
      email: "owner@rawaq.com",
      role: "owner"
    });

    await repository.close();
  });

  it("creates a pending owner invite and activates the owner only after acceptance", async () => {
    const repository = createInMemoryIdentityRepository();

    const result = await createOwnerInvite(repository, {
      displayName: "Avery Owner",
      email: "avery@store.com",
      locationId: "flagship-01",
      dashboardUrl: "https://client.example.com"
    });

    expect(result.invite.inviteUrl).toContain("/invites/");
    expect(result.operator.active).toBe(false);
    await expect(repository.verifyOperatorPassword("avery@store.com", "AcceptedPassword123!")).resolves.toBeUndefined();

    const token = result.invite.inviteUrl?.split("/invites/")[1];
    expect(token).toBeTruthy();
    const lookup = await lookupOwnerInvite(repository, token!);
    expect(lookup.operator.email).toBe("avery@store.com");

    const accepted = await acceptOwnerInvite(repository, token!, {
      password: "AcceptedPassword123!"
    });
    expect(accepted.operator.active).toBe(true);
    expect(accepted.invite.status).toBe("consumed");
    await expect(repository.verifyOperatorPassword("avery@store.com", "AcceptedPassword123!")).resolves.toMatchObject({
      role: "owner"
    });

    await expect(acceptOwnerInvite(repository, token!, { password: "AcceptedPassword123!" })).rejects.toMatchObject({
      code: "INVITE_CONSUMED"
    });

    await repository.close();
  });

  it("rejects invalid, expired, and revoked owner invites", async () => {
    const repository = createInMemoryIdentityRepository();
    await expect(lookupOwnerInvite(repository, "missing-token-value-1234567890")).rejects.toBeInstanceOf(OwnerInviteError);

    const expired = await createOwnerInvite(repository, {
      displayName: "Expired Owner",
      email: "expired@store.com",
      locationId: "expired-01"
    });
    await repository.createOwnerInvite({
      locationId: "expired-01",
      operatorUserId: expired.operator.operatorUserId,
      email: "expired@store.com",
      tokenHash: hashOwnerInviteToken("expired-token-value-1234567890"),
      expiresAt: "2000-01-01T00:00:00.000Z"
    });

    await expect(lookupOwnerInvite(repository, "expired-token-value-1234567890")).rejects.toMatchObject({
      code: "INVITE_EXPIRED"
    });

    const revoked = await createOwnerInvite(repository, {
      displayName: "Revoked Owner",
      email: "revoked@store.com",
      locationId: "revoked-01"
    });
    await repository.revokeActiveOwnerInvites({
      locationId: "revoked-01",
      email: "revoked@store.com"
    });
    const revokedToken = revoked.invite.inviteUrl?.split("/invites/")[1] ?? revoked.token;
    await expect(lookupOwnerInvite(repository, revokedToken)).rejects.toMatchObject({
      code: "INVITE_REVOKED"
    });

    await repository.close();
  });
});
