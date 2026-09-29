export function isOnboardingIncomplete(status: string | null | undefined) {
  return Boolean(status && status !== "approved" && status !== "live");
}
