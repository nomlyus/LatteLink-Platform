import { operatorMeResponseSchema, operatorSelfProfileUpdateSchema } from "@lattelink/contracts-auth";
import { requestJson, type OperatorSession } from "../../api";

export function updateOwnerName(session: OperatorSession, name: string) {
  return requestJson({ apiBaseUrl: session.apiBaseUrl, accessToken: session.accessToken, path: "/admin/operator-profile", method: "PATCH", body: operatorSelfProfileUpdateSchema.parse({ displayName: name }), schema: operatorMeResponseSchema });
}
