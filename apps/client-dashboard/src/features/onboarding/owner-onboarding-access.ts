// These entries complete authentication/setup, not normal dashboard access.
export function isOwnerOnboardingCompatibilityEntry(pathname: string | null, search: string, development: boolean) {
  if (pathname === "/invites" || pathname === "/onboarding") return true;
  if (pathname === "/" && new URLSearchParams(search).get("google_auth_callback") === "1") return true;
  return development && pathname === "/dev/onboarding";
}
