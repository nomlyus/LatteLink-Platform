import {
  operatorUserCreateSchema,
  operatorUserListResponseSchema,
  operatorUserSchema,
  operatorUserUpdateSchema
} from "@lattelink/contracts-auth";
import { z } from "zod";
import { adminMutationSuccessSchema } from "@lattelink/contracts-catalog";
import { requestJson, type OperatorSession } from "../../api";
import type { OperatorUser } from "../../model";

function requireTeamLocation(locationId: string | "all" | null) {
  if (!locationId || locationId === "all") throw new Error("Choose one location before managing team access.");
  return locationId;
}

export function fetchOperatorTeam(session: OperatorSession, locationId: string, signal?: AbortSignal) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/staff",
    query: { locationId: requireTeamLocation(locationId) },
    signal,
    schema: operatorUserListResponseSchema
  }).then(({ users }) => users);
}

export function createOperatorTeamMember(
  session: OperatorSession,
  locationId: string,
  input: z.input<typeof operatorUserCreateSchema>
): Promise<OperatorUser> {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: "/admin/staff",
    query: { locationId: requireTeamLocation(locationId) },
    method: "POST",
    body: operatorUserCreateSchema.parse(input),
    schema: operatorUserSchema
  });
}

export function updateOperatorTeamMember(
  session: OperatorSession,
  locationId: string,
  operatorUserId: string,
  input: z.input<typeof operatorUserUpdateSchema>
): Promise<OperatorUser> {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/staff/${operatorUserId}`,
    query: { locationId: requireTeamLocation(locationId) },
    method: "PATCH",
    body: operatorUserUpdateSchema.parse(input),
    schema: operatorUserSchema
  });
}

export function deleteOperatorTeamMember(session: OperatorSession, locationId: string, operatorUserId: string) {
  return requestJson({
    apiBaseUrl: session.apiBaseUrl,
    accessToken: session.accessToken,
    path: `/admin/staff/${operatorUserId}`,
    query: { locationId: requireTeamLocation(locationId) },
    method: "DELETE",
    schema: adminMutationSuccessSchema
  });
}
