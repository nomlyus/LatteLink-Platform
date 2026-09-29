import {
  operatorUserCreateSchema,
  operatorUserUpdateSchema,
  resolveOperatorCapabilities,
} from "@lattelink/contracts-auth";
import { z } from "zod";
import {
  canManageTeamMembers,
  canReadTeamMembers,
  getOperatorRoleLabel,
  isOwnerOperator,
  type OperatorUser
} from "../../model";

export type TeamCreateDraft = {
  displayName: string;
  email: string;
  role: "manager" | "store";
  password: string;
};
export type TeamCreateInput = z.output<typeof operatorUserCreateSchema>;

export type TeamMemberDraft = {
  displayName: string;
  email: string;
  role: OperatorUser["role"];
  active: boolean;
  password: string;
};

export function getTeamScopeKey(operatorUserId: string | null, locationId: string | "all" | null, capabilities: readonly string[] = []) {
  return `${operatorUserId ?? "signed-out"}:${locationId ?? "unselected"}:${[...capabilities].sort().join(",")}`;
}

export function canReadTeam(operator: Pick<OperatorUser, "capabilities"> | null | undefined) {
  return canReadTeamMembers(operator);
}

export function canWriteTeam(operator: Pick<OperatorUser, "capabilities"> | null | undefined) {
  return canManageTeamMembers(operator);
}

export function canDeleteTeamMember(
  actor: Pick<OperatorUser, "operatorUserId" | "role" | "capabilities">,
  target: Pick<OperatorUser, "operatorUserId" | "role">
) {
  return isOwnerOperator(actor) && canWriteTeam(actor) && target.role !== "owner" && actor.operatorUserId !== target.operatorUserId;
}

export function getTeamRoleLabel(role: OperatorUser["role"]) {
  return getOperatorRoleLabel(role);
}

export function validateTeamCreateDraft(draft: TeamCreateDraft) {
  return operatorUserCreateSchema.safeParse({
    displayName: draft.displayName.trim(),
    email: draft.email.trim(),
    role: draft.role,
    password: draft.password.trim()
  });
}

export function buildTeamMemberUpdate(target: OperatorUser, draft: TeamMemberDraft): z.output<typeof operatorUserUpdateSchema> | null {
  const patch = {
    ...(draft.displayName.trim() !== target.displayName ? { displayName: draft.displayName.trim() } : {}),
    ...(draft.email.trim() !== target.email ? { email: draft.email.trim() } : {}),
    // Identity rejects owner as an update value. Omit the unchanged owner role, but allow demotion.
    ...(draft.role !== target.role ? { role: draft.role } : {}),
    ...(draft.active !== target.active ? { active: draft.active } : {}),
    ...(draft.password.trim() ? { password: draft.password.trim() } : {})
  };
  if (Object.keys(patch).length === 0) return null;
  return operatorUserUpdateSchema.parse(patch);
}

export function requiresTeamAccessConfirmation(target: OperatorUser, draft: TeamMemberDraft) {
  if (target.active && !draft.active) return true;
  if (target.role === draft.role) return false;
  const nextCapabilities = new Set(resolveOperatorCapabilities(draft.role));
  return target.capabilities.some((capability) => !nextCapabilities.has(capability));
}

export function getTeamMemberLocationNames(
  member: Pick<OperatorUser, "locationId" | "locationIds">,
  availableLocations: readonly { locationId: string; locationName: string }[]
) {
  const memberLocationIds = new Set(member.locationIds ?? [member.locationId]);
  return availableLocations.filter((location) => memberLocationIds.has(location.locationId)).map((location) => location.locationName);
}

export function getAdditionalTeamLocationCount(
  member: Pick<OperatorUser, "locationId" | "locationIds">,
  availableLocations: readonly { locationId: string }[]
) {
  const total = new Set(member.locationIds ?? [member.locationId]).size;
  const availableIds = new Set(availableLocations.map(({ locationId }) => locationId));
  const visible = [...new Set(member.locationIds ?? [member.locationId])].filter((locationId) => availableIds.has(locationId)).length;
  return Math.max(0, total - visible);
}
