const minTimeoutMs = 1000;
const maxTimeoutMs = 60000;

export function resolveTargetTimeout(target, defaults) {
  let hostname;
  try {
    const url = new URL(target.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Invalid target URL" };
    hostname = url.hostname.toLowerCase();
  } catch {
    return { error: "Invalid target URL" };
  }

  const timeoutMs = target.timeoutMs ?? (hostname === "api-dev.nomly.us" ? defaults.devApiTimeoutMs : defaults.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < minTimeoutMs || timeoutMs > maxTimeoutMs) {
    return { error: "Invalid target timeout" };
  }
  return { timeoutMs };
}

export function safeRequestId(value) {
  if (typeof value !== "string") return undefined;
  const sanitized = value.replace(/[^A-Za-z0-9._:/-]/g, "").slice(0, 128);
  return sanitized || undefined;
}

export function safeTargetUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "<invalid target URL>";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "<invalid target URL>";
  }
}

export function safeMarkdownText(value, maxLength = 200) {
  return String(value).replace(/[\r\n\u0000-\u001f|]/g, " ").slice(0, maxLength);
}

export function safeTargetKey(value) {
  return String(value).replace(/[^A-Za-z0-9._:-]/g, "").replace(/-+/g, "-").slice(0, 120) || "unknown-target";
}

export function failureResult(target, error, checkedAt = new Date().toISOString()) {
  return {
    ...target,
    ok: false,
    status: null,
    responseTimeMs: 0,
    checkedAt,
    error
  };
}
