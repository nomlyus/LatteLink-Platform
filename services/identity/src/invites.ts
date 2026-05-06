import { createHash, randomBytes } from "node:crypto";
import {
  internalOwnerInviteResponseSchema,
  operatorInviteAcceptResponseSchema,
  operatorInviteLookupResponseSchema,
  type InternalOwnerInviteRequest,
  type InternalOwnerInviteResponse,
  type OperatorInviteAcceptResponse,
  type OperatorInviteLookupResponse
} from "@lattelink/contracts-auth";
import type { IdentityRepository, OperatorUserRecord, OwnerInviteRecord } from "./repository.js";
import { generateTemporaryOwnerPassword } from "./provisioning.js";

const ownerInviteTtlMs = 7 * 24 * 60 * 60 * 1000;

export class OwnerInviteError extends Error {
  constructor(
    public readonly code:
      | "INVITE_NOT_FOUND"
      | "INVITE_EXPIRED"
      | "INVITE_CONSUMED"
      | "INVITE_REVOKED"
      | "OPERATOR_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "OwnerInviteError";
  }
}

export function generateOwnerInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOwnerInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildOwnerInviteUrl(baseUrl: string | undefined, token: string) {
  const resolvedBaseUrl = baseUrl?.trim();
  if (!resolvedBaseUrl) {
    return undefined;
  }

  return new URL(`/invites/${encodeURIComponent(token)}`, resolvedBaseUrl).toString();
}

function assertInviteUsable(invite: OwnerInviteRecord | undefined): asserts invite is OwnerInviteRecord {
  if (!invite) {
    throw new OwnerInviteError("INVITE_NOT_FOUND", "Invite was not found");
  }
  if (invite.status === "consumed") {
    throw new OwnerInviteError("INVITE_CONSUMED", "Invite has already been accepted");
  }
  if (invite.status === "revoked") {
    throw new OwnerInviteError("INVITE_REVOKED", "Invite has been revoked");
  }
  if (invite.status === "expired") {
    throw new OwnerInviteError("INVITE_EXPIRED", "Invite has expired");
  }
}

function attachInviteUrl(invite: OwnerInviteRecord, inviteUrl?: string) {
  return {
    ...invite,
    inviteUrl
  };
}

export async function createOwnerInvite(
  repository: IdentityRepository,
  input: InternalOwnerInviteRequest & { locationId: string; dashboardUrl?: string }
): Promise<InternalOwnerInviteResponse & { token: string }> {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const existingOwner = (await repository.listOperatorUsers(input.locationId)).find((operator) => operator.role === "owner");
  const operator =
    existingOwner ??
    (await repository.createOperatorUser({
      displayName,
      email,
      role: "owner",
      locationId: input.locationId,
      password: generateTemporaryOwnerPassword()
    }));

  const updatedOperator =
    (await repository.updateOperatorUser(operator.operatorUserId, {
      displayName,
      email,
      role: "owner",
      active: false
    })) ?? operator;

  await repository.revokeActiveOwnerInvites({
    locationId: input.locationId,
    email
  });

  const token = generateOwnerInviteToken();
  const invite = await repository.createOwnerInvite({
    locationId: input.locationId,
    operatorUserId: updatedOperator.operatorUserId,
    email,
    tokenHash: hashOwnerInviteToken(token),
    expiresAt: new Date(Date.now() + ownerInviteTtlMs).toISOString()
  });

  return {
    ...internalOwnerInviteResponseSchema.parse({
      operator: updatedOperator,
      invite: attachInviteUrl(invite, buildOwnerInviteUrl(input.dashboardUrl, token)),
      action: existingOwner ? "updated" : "created"
    }),
    token
  };
}

export async function resendOwnerInvite(
  repository: IdentityRepository,
  input: InternalOwnerInviteRequest & { locationId: string; dashboardUrl?: string }
) {
  const result = await createOwnerInvite(repository, input);
  return {
    ...result,
    action: "resent" as const
  };
}

export async function lookupOwnerInvite(
  repository: IdentityRepository,
  token: string
): Promise<OperatorInviteLookupResponse> {
  const invite = await repository.getOwnerInviteByTokenHash(hashOwnerInviteToken(token));
  assertInviteUsable(invite);
  const operator = await repository.getOperatorUserById(invite.operatorUserId);
  if (!operator) {
    throw new OwnerInviteError("OPERATOR_NOT_FOUND", "Invited operator was not found");
  }

  return operatorInviteLookupResponseSchema.parse({
    invite,
    operator: {
      displayName: operator.displayName,
      email: operator.email,
      role: operator.role,
      locationId: operator.locationId
    }
  });
}

export async function acceptOwnerInvite(
  repository: IdentityRepository,
  token: string,
  input: { password: string }
): Promise<OperatorInviteAcceptResponse> {
  const invite = await repository.getOwnerInviteByTokenHash(hashOwnerInviteToken(token));
  assertInviteUsable(invite);
  const operator = await repository.updateOperatorUser(invite.operatorUserId, {
    active: true,
    password: input.password
  });
  if (!operator) {
    throw new OwnerInviteError("OPERATOR_NOT_FOUND", "Invited operator was not found");
  }
  const consumedInvite = await repository.markOwnerInviteConsumed(invite.inviteId);

  return operatorInviteAcceptResponseSchema.parse({
    operator: operator as OperatorUserRecord,
    invite: consumedInvite ?? {
      ...invite,
      status: "consumed",
      consumedAt: new Date().toISOString()
    }
  });
}
