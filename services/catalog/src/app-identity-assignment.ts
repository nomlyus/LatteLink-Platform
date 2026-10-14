import { createHash } from "node:crypto";
import type { AppIdentityProfile } from "@lattelink/contracts-catalog";

export function assignNomlyAppIdentifiers(locationId: string, existing: Pick<AppIdentityProfile, "bundleIdentifier" | "sku">) {
  // Identity profiles are location-scoped today. Use the stable scope, not a
  // mutable brand/app name; retries and name changes must not change identity.
  const suffix = createHash("sha256").update(locationId).digest("hex").slice(0, 24);
  return {
    bundleIdentifier: existing.bundleIdentifier ?? `us.nomly.app${suffix}`,
    sku: existing.sku ?? `nomly-${suffix}`
  };
}
