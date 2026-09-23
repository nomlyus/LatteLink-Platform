import type { Event } from "@sentry/nextjs";

function sanitizeSensitiveUrl(value: string | undefined) {
  if (!value) return value;
  const queryIndex = value.indexOf("?");
  const fragmentIndex = value.indexOf("#");
  const end = [queryIndex, fragmentIndex]
    .filter((index) => index >= 0)
    .reduce((current, index) => Math.min(current, index), value.length);
  return value.slice(0, end).replace(/((?:^|\/)invites?\/)[^/?#]+/gi, "$1[redacted]");
}

export function scrubInviteDetails<T extends Event>(event: T): T {
  if (event.request?.url) event.request.url = sanitizeSensitiveUrl(event.request.url);
  if (event.transaction) event.transaction = sanitizeSensitiveUrl(event.transaction);
  for (const breadcrumb of event.breadcrumbs ?? []) {
    const data = breadcrumb.data;
    if (!data) continue;
    for (const key of ["from", "to", "url", "uri"]) {
      if (typeof data[key] === "string") data[key] = sanitizeSensitiveUrl(data[key] as string);
    }
  }
  return event;
}
