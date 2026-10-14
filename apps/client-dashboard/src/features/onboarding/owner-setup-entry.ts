import type { OperatorSession } from "../../api";
import { fetchOperatorOnboardingSummary } from "./onboarding-api";
import { requiresFirstTimeOwnerSetup } from "./owner-setup-domain";

export async function resolveOwnerSetupSignInDestination(session: OperatorSession, destination: string | null, signal?: AbortSignal) {
  if (session.operator.role !== "owner" || !destination || destination === "/") return destination;
  try {
    const summary = await fetchOperatorOnboardingSummary(session, session.operator.locationId, signal);
    return requiresFirstTimeOwnerSetup(summary) ? "/" : destination;
  } catch (error) {
    if (signal?.aborted) throw error;
    // Sign-in itself succeeded. Home can report/retry the setup lookup rather
    // than silently bypassing onboarding or misreporting invalid credentials.
    return "/";
  }
}
