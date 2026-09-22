/** The public platform name used only when a merchant-specific name is unavailable. */
export const DEFAULT_PLATFORM_DISPLAY_NAME = "Nomly";

/**
 * Resolves a user-visible name without allowing an empty environment value to
 * erase the platform fallback. Merchant-specific values always take precedence.
 */
export function resolveDisplayName(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const displayName = candidate?.trim();
    if (displayName) {
      return displayName;
    }
  }

  return DEFAULT_PLATFORM_DISPLAY_NAME;
}
