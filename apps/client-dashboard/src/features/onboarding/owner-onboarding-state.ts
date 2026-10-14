import type { AdminStoreConfig } from "@lattelink/contracts-catalog";
import type { OperatorOnboardingSummary } from "./onboarding-api";

export type OwnerOnboardingLocation = {
  summary: OperatorOnboardingSummary;
  config: AdminStoreConfig;
};
export type OwnerOnboardingStep = 0 | 1 | 2 | 3 | 4;

export function hasProvisionedLocationDetails(config: AdminStoreConfig) {
  return Boolean(config.storeName.trim() && config.locationName.trim() && config.hours.trim()) &&
    Number.isInteger(config.taxRateBasisPoints) && config.taxRateBasisPoints >= 0 && config.taxRateBasisPoints <= 10_000;
}

export function hasCompletedTeamStep(summary: OperatorOnboardingSummary) {
  return summary.checklist.some((check) => check.id === "team_configured_or_skipped" && check.passed);
}

export function getOwnerOnboardingStep(locations: OwnerOnboardingLocation[]): OwnerOnboardingStep {
  if (!locations.length || !locations[0].summary.ownerProfile) return 0;
  if (locations.some((location) => !location.summary.ownerDetailsConfirmedAt || !location.summary.ownerLocationDetails || !hasProvisionedLocationDetails(location.config))) return 1;
  if (locations.some((location) => !location.summary.paymentReadiness?.ready)) return 2;
  if (locations.some((location) => !hasCompletedTeamStep(location.summary))) return 3;
  return 4;
}

export function canSubmitOwnerOnboarding(locations: OwnerOnboardingLocation[]) {
  return getOwnerOnboardingStep(locations) === 4;
}
