#!/usr/bin/env node

// Bounded, dev-only order-path load probe. Creates dev customers, checkout
// drafts, and Stripe test-mode PaymentIntents; it does not make paid orders.

const baseUrl = (process.env.API_BASE_URL ?? "https://api-dev.nomly.us/v1").replace(/\/$/, "");
const locationId = process.env.DEV_E2E_LOCATION_ID ?? "rawaqcoffee01";
const stages = (process.env.LOAD_STAGES ?? "2,4,8,12").split(",").map(Number);
const runId = Date.now();

if (new URL(baseUrl).hostname !== "api-dev.nomly.us" || !baseUrl.endsWith("/v1")) {
  throw new Error("Load probe is restricted to https://api-dev.nomly.us/v1");
}
if (stages.some((count) => !Number.isInteger(count) || count < 1 || count > 16)) {
  throw new Error("Each LOAD_STAGES concurrency must be an integer from 1 to 16");
}

async function request(path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json", "content-type": "application/json", ...init.headers }
  });
  const body = await response.json().catch(() => null);
  const latencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    throw Object.assign(new Error(`${path} returned ${response.status}`), {
      status: response.status,
      code: body?.code,
      latencyMs
    });
  }
  return { body, latencyMs };
}

function requiredSelections(item) {
  return (item.customizationGroups ?? [])
    .filter((group) => group.required || (group.minSelections ?? 0) > 0)
    .map((group) => {
      const option = (group.options ?? []).find((candidate) => candidate.default && candidate.available !== false)
        ?? (group.options ?? []).find((candidate) => candidate.available !== false);
      if (!option) throw new Error("No available required customization option");
      return { groupId: group.id, optionId: option.id };
    });
}

function percentile(values, percent) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((percent / 100) * sorted.length) - 1];
}

async function main() {
  const ready = await request("/../ready");
  if (ready.body?.status !== "ready") throw new Error("Dev gateway is not ready");
  let previousQueuedByGroup = Object.fromEntries((ready.body.upstream ?? []).map((upstream) => [
    upstream.body?.environment?.database?.pool?.group ?? upstream.service,
    upstream.body?.environment?.database?.pool?.queuedAcquires ?? 0
  ]));
  const menu = (await request(`/menu?locationId=${encodeURIComponent(locationId)}`)).body;
  const item = menu.categories?.flatMap((category) => category.items ?? [])
    .find((candidate) => candidate.visible !== false);
  if (!item) throw new Error("No visible menu item");
  const selectedOptions = requiredSelections(item);
  const results = [];

  for (const concurrency of stages) {
    const stageStartedAt = performance.now();
    const attempts = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const times = {};
      let step = "auth";
      try {
        const session = await request("/auth/dev-access", {
          method: "POST",
          body: JSON.stringify({
            email: `pool-load-${runId}-${concurrency}-${index}@rawaq.local`,
            name: "Dev Pool Load"
          })
        });
        times.auth = session.latencyMs;
        const headers = { Authorization: `Bearer ${session.body.accessToken}` };

        step = "quote";
        const quote = await request("/orders/quote", {
          method: "POST",
          headers,
          body: JSON.stringify({
            locationId,
            items: [{ itemId: item.id, quantity: 1, customization: { selectedOptions, notes: "" } }],
            pointsToRedeem: 0
          })
        });
        times.quote = quote.latencyMs;

        step = "checkout";
        const checkout = await request("/orders/checkouts", {
          method: "POST",
          headers,
          body: JSON.stringify({ quoteId: quote.body.quoteId, quoteHash: quote.body.quoteHash })
        });
        times.checkout = checkout.latencyMs;

        step = "payment-init";
        const payment = await request("/payments/stripe/mobile-session", {
          method: "POST",
          headers,
          body: JSON.stringify({ checkoutId: checkout.body.checkoutId })
        });
        times.paymentInit = payment.latencyMs;
        if (!payment.body.paymentIntentId) throw new Error("PaymentIntent missing");
        return { ok: true, times };
      } catch (error) {
        return { ok: false, step, status: error.status ?? null, code: error.code ?? error.name, times };
      }
    }));
    const stage = {
      concurrency,
      elapsedMs: Math.round(performance.now() - stageStartedAt),
      successful: attempts.filter((attempt) => attempt.ok).length,
      errors: attempts.filter((attempt) => !attempt.ok).map(({ step, status, code }) => ({ step, status, code })),
      latencyMs: Object.fromEntries(["auth", "quote", "checkout", "paymentInit"].map((step) => {
        const values = attempts.map((attempt) => attempt.times[step]).filter((value) => value !== undefined);
        return [step, { median: percentile(values, 50), p95: percentile(values, 95), max: values.length ? Math.max(...values) : null }];
      }))
    };
    const afterReady = await request("/../ready");
    stage.pools = Object.fromEntries(
      (afterReady.body.upstream ?? []).map((upstream) => [
        upstream.service,
        upstream.body?.environment?.database?.pool ?? null
      ])
    );
    const currentQueuedByGroup = Object.fromEntries(Object.entries(stage.pools).map(([service, pool]) => [
      pool?.group ?? service,
      pool?.queuedAcquires ?? 0
    ]));
    stage.newQueuedAcquires = Object.fromEntries(Object.entries(currentQueuedByGroup).map(([group, count]) => [
      group,
      count - (previousQueuedByGroup[group] ?? 0)
    ]));
    previousQueuedByGroup = currentQueuedByGroup;
    results.push(stage);
    console.log(JSON.stringify(stage));
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  console.log(JSON.stringify({ complete: true, runId, results }));
}

main().catch((error) => {
  console.error(JSON.stringify({ failed: true, message: error.message }));
  process.exitCode = 1;
});
