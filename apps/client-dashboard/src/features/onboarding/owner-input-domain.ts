import { ownerOnboardingLocationDetailsSchema, ownerOnboardingProfileSchema } from "@lattelink/contracts-catalog";
import type { z } from "zod";

export type OwnerProfileInput = z.output<typeof ownerOnboardingProfileSchema>;
export type OwnerLocationInput = z.output<typeof ownerOnboardingLocationDetailsSchema>;

export function taxPercentToBasisPoints(value: string) {
  const normalized = value.trim();
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Enter a tax percentage with up to two decimal places.");
  const [whole, fraction = ""] = normalized.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (basisPoints > 10_000) throw new Error("Tax must be between 0% and 100%.");
  return basisPoints;
}
