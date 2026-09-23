import type { Event } from "@sentry/nextjs";

const sensitiveFieldPattern = /(token|password|secret|authorization|cookie|api[_-]?key)/i;

function sanitizeSensitiveText(value: string) {
  return value
    .replace(/((?:^|\/)invites?\/)[^/?#\s]+/gi, "$1[redacted]")
    .replace(/([?&](?:inviteToken|invite|token)=)[^&#\s]+/gi, "$1[redacted]");
}

function sanitizeSensitiveUrl(value: string | undefined) {
  if (!value) return value;
  const queryIndex = value.indexOf("?");
  const fragmentIndex = value.indexOf("#");
  const end = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((current, index) => Math.min(current, index), value.length);
  return sanitizeSensitiveText(value.slice(0, end));
}

function scrubValue(value: unknown, key?: string): unknown {
  if (key && sensitiveFieldPattern.test(key)) return "[redacted]";
  if (typeof value === "string" && key && /(url|uri|path|referer|from|to)/i.test(key)) {
    return sanitizeSensitiveUrl(value);
  }
  if (typeof value === "string") return sanitizeSensitiveText(value);
  if (Array.isArray(value)) return value.map((entry) => scrubValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, scrubValue(entryValue, entryKey)]));
  }
  return value;
}

export function scrubInviteDetails<T extends Event>(event: T): T {
  return scrubValue(event) as T;
}
