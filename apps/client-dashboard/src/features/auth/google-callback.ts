export type GoogleCallbackParams = {
  redirectUri: string;
  code?: string;
  state?: string;
  error?: string;
};

export function getGoogleCallbackRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/?google_auth_callback=1`;
}

export function readGoogleCallbackParams(origin: string, search: string): GoogleCallbackParams | null {
  const params = new URLSearchParams(search);
  if (params.get("google_auth_callback") !== "1") return null;
  return {
    redirectUri: getGoogleCallbackRedirectUri(origin),
    code: params.get("code")?.trim() || undefined,
    state: params.get("state")?.trim() || undefined,
    error: params.get("error")?.trim() || undefined
  };
}

export function stripGoogleCallbackParams(pathname: string, search: string, hash = "") {
  const params = new URLSearchParams(search);
  for (const key of ["google_auth_callback", "code", "state", "scope", "authuser", "prompt", "error", "error_subtype"]) {
    params.delete(key);
  }
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}
