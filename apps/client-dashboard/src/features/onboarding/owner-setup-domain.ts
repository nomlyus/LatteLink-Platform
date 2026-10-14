import type { OperatorOnboardingSummary } from "./onboarding-api";

export type OwnerSetupStep = 1 | 2 | 3;

export function requiresFirstTimeOwnerSetup(summary: OperatorOnboardingSummary) {
  if (summary.ownerSetupCompletedAt) return false;
  if (summary.ownerSetupRequired !== undefined) return summary.ownerSetupRequired;
  // Rolling-deployment compatibility: a configured legacy merchant must not be
  // mistaken for a new brand while the backend completion migration is pending.
  if (["ready_for_review", "approved", "live"].includes(summary.status)) return false;
  return !["business_profile_complete", "store_operations_complete"].every((id) =>
    summary.checklist.some((check) => check.id === id && check.passed)
  );
}

export function getOwnerSetupResumeStep(summary: OperatorOnboardingSummary): OwnerSetupStep {
  if (!["business_profile_complete", "store_operations_complete"].every((id) => summary.checklist.some((check) => check.id === id && check.passed))) return 1;
  if (!summary.appIdentity?.appName || !summary.appIdentity.displayName) return 2;
  return 3;
}
