# Menu Sync Worker Runbook

Last reviewed: `2026-03-10`

## Purpose

`@lattelink/menu-sync-worker` ingests menu data from the web content source and validates it against `@lattelink/contracts-catalog`.

The worker now includes:
- scheduled polling loop
- retry with exponential backoff
- dead-letter logging after retry exhaustion

## Environment Variables

- `WEBAPP_MENU_SOURCE_URL`
  - default: `https://webapp.gazellecoffee.com/api/content/public`
- `MENU_SYNC_INTERVAL_MS`
  - default: `300000` (5 minutes)
- `MENU_SYNC_MAX_RETRIES`
  - default: `3` (total attempts = retries + 1)
- `MENU_SYNC_RETRY_DELAY_MS`
  - default: `2000` (first retry delay, doubles per attempt)
- `MENU_SYNC_LOCATION_ID`
  - default: legacy dev placeholder in code; set this explicitly for any real deployment
- `MENU_SYNC_DEAD_LETTER_PATH`
  - default: `./dead-letter/menu-sync.jsonl`

## Local Run

```bash
pnpm --filter @lattelink/menu-sync-worker dev
```

## Failure Behavior

1. A sync cycle is attempted immediately on startup.
2. On failure, retries run with exponential backoff:
   - `retryDelayMs * 2^(attempt-1)`
3. After final failure, a dead-letter record is appended to `MENU_SYNC_DEAD_LETTER_PATH`.
4. The worker keeps running and schedules the next cycle.

Dead-letter record shape:

```json
{
  "occurredAt": "2026-03-10T00:00:00.000Z",
  "sourceUrl": "https://webapp.gazellecoffee.com/api/content/public",
  "locationId": "location-01",
  "attempts": 4,
  "error": "Menu source responded with 503"
}
```

## Basic Triage

1. Confirm source availability:
```bash
curl -i "$WEBAPP_MENU_SOURCE_URL"
```
2. Check recent worker logs for retry/dead-letter messages.
3. Inspect dead-letter entries:
```bash
tail -n 20 ./dead-letter/menu-sync.jsonl
```
4. If source payload schema changed, update contract mapping before re-enabling normal cadence.
