import { ownerOnboardingProfileSchema, type ClientPaymentProfile } from "@lattelink/contracts-catalog";
import { OwnerSetupIncompleteError } from "./owner-setup.js";

export type OwnerSubmissionLocation = {
  ownerDetailsConfirmedAt?: string;
  address?: string;
  timezone?: string;
  locationId: string;
  locationName: string;
  storeName?: string;
  hours?: string;
  taxRateBasisPoints?: number;
  teamConfiguredOrSkipped: boolean;
  paymentProfile?: ClientPaymentProfile;
};

// Submission evaluates saved provisioning, not presentation flags or a populated
// menu. Native identity, branding, and Apple readiness belong to Nomly's later gate.
export function assertOwnerSubmissionReady(locations: OwnerSubmissionLocation[], requestedIds: string[], ownerProfile?: unknown) {
  assertOwnerSubmissionLocationSet(locations.map((location) => location.locationId), requestedIds);
  const missing: string[] = [];
  if (!ownerOnboardingProfileSchema.safeParse(ownerProfile).success) missing.push("your name and brand details");
  for (const location of locations) {
    const prefix = `${location.locationName}: `;
    if (!location.ownerDetailsConfirmedAt || !location.address?.trim() || !location.timezone?.trim() || !location.locationName.trim()) missing.push(`${prefix}owner-confirmed location details`);
    if (!location.storeName?.trim()) missing.push(`${prefix}store name`);
    if (!location.hours?.trim()) missing.push(`${prefix}hours`);
    if (typeof location.taxRateBasisPoints !== "number" || !Number.isInteger(location.taxRateBasisPoints) || location.taxRateBasisPoints < 0 || location.taxRateBasisPoints > 10_000) missing.push(`${prefix}tax configuration`);
    if (!location.teamConfiguredOrSkipped) missing.push(`${prefix}team setup or skip`);
    const payment = location.paymentProfile;
    if (!payment || payment.locationId !== location.locationId || !payment.stripeAccountId || payment.stripeOnboardingStatus !== "completed" || !payment.stripeChargesEnabled || !payment.stripePayoutsEnabled) {
      missing.push(`${prefix}Stripe connection and verification`);
    }
  }
  if (missing.length) throw new OwnerSetupIncompleteError(missing);
}

export function assertOwnerSubmissionLocationSet(locationIds: string[], requestedIds: string[]) {
  const expected = new Set(locationIds);
  if (!expected.size || requestedIds.length !== expected.size || new Set(requestedIds).size !== expected.size || requestedIds.some((id) => !expected.has(id))) {
    throw new OwnerSetupIncompleteError(["the current provisioned location list; reload onboarding"]);
  }
}
