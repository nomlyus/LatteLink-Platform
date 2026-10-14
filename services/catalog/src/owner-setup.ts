export class OwnerSetupIncompleteError extends Error {
  readonly statusCode = 422;
  readonly code = "OWNER_SETUP_INCOMPLETE";
  constructor(readonly missingFields: string[]) {
    super(`Complete ${missingFields.join(", ")} before finishing brand setup.`);
    this.name = "OwnerSetupIncompleteError";
  }
}

// First-time brand setup is not App Store or payment readiness. Once completed,
// later configuration edits or release failures must never reopen onboarding.
export function assertOwnerSetupComplete(input: {
  businessProfileComplete: boolean;
  storeOperationsComplete: boolean;
  storeName?: string;
  hours?: string;
  pickupInstructions?: string;
  appName?: string;
  displayName?: string;
}) {
  const missing: string[] = [];
  if (!input.businessProfileComplete) missing.push("store profile");
  if (!input.storeOperationsComplete) missing.push("store operations");
  for (const [key, label] of [["storeName", "store name"], ["hours", "hours"], ["pickupInstructions", "pickup instructions"], ["appName", "app name"], ["displayName", "home screen name"]] as const) {
    if (!input[key]?.trim()) missing.push(label);
  }
  if (missing.length) throw new OwnerSetupIncompleteError(missing);
}
