/** Previews must never be enabled by a URL parameter, a release build, or a production API. */
export function canAccessDesignPreviews(developmentBundle: boolean, apiBaseUrl: string, variant: string | null) {
  if (!developmentBundle || variant === "production") return false;
  try {
    const url = new URL(apiBaseUrl);
    return (url.protocol === "https:" && url.hostname === "api-dev.nomly.us")
      || (["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch { return false; }
}
