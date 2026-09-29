import type { OperatorSession } from "./auth-types";

export function validateSignIn(email: string, password: string) {
  if (!email.trim()) return "A work email is required.";
  if (!password) return "A password is required.";
  return null;
}

export function getPostSignInPath(pathname: string, session: OperatorSession) {
  if (session.operator.role === "store") return "/orders";
  if (pathname === "/" || pathname.startsWith("/legacy/")) return null;
  return pathname;
}

export function safeAuthError(error: unknown, fallback: string, secrets: readonly string[] = []) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message || secrets.some((secret) => secret.length > 0 && message.includes(secret))) return fallback;
  if (/\b(password|access.?token|refresh.?token|authorization|oauth code|invite token)\b/i.test(message)) return fallback;
  return message;
}

export function isLaunchEntry(search: string) {
  const params = new URLSearchParams(search);
  return params.get("intent")?.trim().toLowerCase() === "launch" || params.get("start")?.trim().toLowerCase() === "app";
}
