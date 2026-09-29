import { operatorPasswordSchema } from "@lattelink/contracts-auth";

export function readInviteTokenFromHash(hash: string) {
  const encodedToken = hash.replace(/^#/, "").trim();
  if (!encodedToken) return null;
  try {
    return decodeURIComponent(encodedToken);
  } catch {
    // Older invite URLs put the raw opaque token directly in the fragment.
    return encodedToken;
  }
}

export function getInviteAcceptanceError(password: string, confirmation: string) {
  if (!password) return "Choose a password to activate your account.";
  if (password !== confirmation) return "Passwords do not match.";
  const parsed = operatorPasswordSchema.safeParse(password);
  if (!parsed.success) return "Use a password between 8 and 128 characters.";
  return null;
}

export const unavailableInviteMessage = "This invite cannot be used. Ask Nomly or your launch contact to resend the invite.";
