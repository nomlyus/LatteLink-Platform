import { z } from "zod";
import {
  operatorInviteAcceptRequestSchema,
  operatorInviteAcceptResponseSchema,
  operatorInviteLookupRequestSchema,
  operatorInviteLookupResponseSchema
} from "@lattelink/contracts-auth";
import { requestJson } from "../../api";

export type OperatorInviteLookup = z.output<typeof operatorInviteLookupResponseSchema>;
export type OperatorInviteAcceptResponse = z.output<typeof operatorInviteAcceptResponseSchema>;

export function lookupOperatorInvite(params: { apiBaseUrl: string; token: string; signal?: AbortSignal }) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/invites/lookup",
    method: "POST",
    body: operatorInviteLookupRequestSchema.parse({ token: params.token }),
    signal: params.signal,
    schema: operatorInviteLookupResponseSchema
  });
}

export function acceptOperatorInvite(params: { apiBaseUrl: string; token: string; password: string; signal?: AbortSignal }) {
  return requestJson({
    apiBaseUrl: params.apiBaseUrl,
    path: "/operator/invites/accept",
    method: "POST",
    signal: params.signal,
    body: operatorInviteAcceptRequestSchema.parse({ token: params.token, password: params.password }),
    schema: operatorInviteAcceptResponseSchema
  });
}
