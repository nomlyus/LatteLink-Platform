export function readOwnerInviteTokenFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!/^\/invites\/?$/.test(window.location.pathname)) {
    return null;
  }

  const fragmentToken = window.location.hash.slice(1).trim();
  if (!fragmentToken) return null;
  try {
    return decodeURIComponent(fragmentToken);
  } catch {
    return fragmentToken;
  }
}
