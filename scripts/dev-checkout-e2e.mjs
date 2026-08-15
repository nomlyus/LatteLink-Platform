#!/usr/bin/env node

const apiBaseUrl = normalizeBaseUrl(process.env.API_BASE_URL ?? process.argv[2]);
const locationId = process.env.DEV_E2E_LOCATION_ID?.trim();
const timeoutMs = Number.parseInt(process.env.DEV_E2E_TIMEOUT_MS ?? "10000", 10);

if (!apiBaseUrl) {
  failPrerequisite("Set API_BASE_URL or pass the API base URL as the first argument, for example https://api-dev.nomly.us/v1.");
}

if (!locationId) {
  failPrerequisite("Set DEV_E2E_LOCATION_ID to the deployed dev location ID.");
}

const apiRootUrl = apiBaseUrl.replace(/\/v1\/?$/, "");
const testRunId = Date.now();
const customerEmail = `dev-e2e-${testRunId}@rawaq.local`;
const customerName = "Dev Checkout E2E";

try {
  await run();
} catch (error) {
  console.error(`[dev-checkout-e2e] failed: ${error.message}`);
  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exit(1);
}

async function run() {
  console.log(`[dev-checkout-e2e] api=${apiBaseUrl}`);
  console.log(`[dev-checkout-e2e] location=${locationId}`);

  const health = await requestRoot("/health");
  const ready = await requestRoot("/ready");
  assert(health.status === "ok", "Gateway health did not return ok.");
  assert(ready.status === "ready", "Gateway ready did not return ready.");
  console.log(`[dev-checkout-e2e] ready upstream=${ready.upstream?.map((target) => `${target.service}:${target.statusCode}`).join(",") ?? "unknown"}`);

  const session = await requestApi("/auth/dev-access", {
    method: "POST",
    body: JSON.stringify({
      email: customerEmail,
      name: customerName
    })
  });
  const authHeaders = { Authorization: `Bearer ${session.accessToken}` };
  console.log(`[dev-checkout-e2e] customer=${session.userId}`);

  const appConfig = await requestApi(`/app-config?locationId=${encodeURIComponent(locationId)}`);
  assert(appConfig.brand?.locationId === locationId, `App config returned location ${appConfig.brand?.locationId ?? "<missing>"}.`);
  console.log(`[dev-checkout-e2e] brand=${appConfig.brand.brandName} locationName=${appConfig.brand.locationName}`);

  const menu = await requestApi(`/menu?locationId=${encodeURIComponent(locationId)}`);
  const item = firstOrderableMenuItem(menu);
  const selectedOptions = defaultRequiredSelections(item);
  console.log(`[dev-checkout-e2e] item=${item.id} selectedOptions=${JSON.stringify(selectedOptions)}`);

  const quote = await requestApi("/orders/quote", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      locationId,
      items: [
        {
          itemId: item.id,
          quantity: 1,
          customization: {
            selectedOptions,
            notes: ""
          }
        }
      ],
      pointsToRedeem: 0
    })
  });
  console.log(`[dev-checkout-e2e] quote=${quote.quoteId} total=${quote.total?.amountCents}`);

  const checkout = await requestApi("/orders/checkouts", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash
    })
  });
  assert(checkout.status === "OPEN", `Checkout status was ${checkout.status}, expected OPEN.`);
  console.log(`[dev-checkout-e2e] checkout=${checkout.checkoutId} status=${checkout.status}`);

  const paymentSession = await requestApi("/payments/stripe/mobile-session", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      checkoutId: checkout.checkoutId
    })
  });
  assert(paymentSession.checkoutId === checkout.checkoutId, "Payment session did not reference the checkout draft.");
  assert(paymentSession.paymentIntentId, "Payment session did not return a payment intent.");
  console.log(`[dev-checkout-e2e] paymentIntent=${paymentSession.paymentIntentId} amount=${paymentSession.amountCents}`);

  const orders = await requestApi("/orders", { headers: authHeaders });
  const prematureOrder = orders.find((order) => order.id === checkout.checkoutId);
  assert(!prematureOrder, "Checkout was promoted to an order before payment finalization.");
  console.log(`[dev-checkout-e2e] ordersAfterPaymentSheetInit=${orders.length} matchingCheckoutOrder=false`);
  console.log("[dev-checkout-e2e] ok");
}

function normalizeBaseUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

async function requestRoot(path, options) {
  return request(`${apiRootUrl}${path}`, options);
}

async function requestApi(path, options) {
  return request(`${apiBaseUrl}${path}`, options);
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const body = parseResponseBody(text);

    if (!response.ok) {
      const error = new Error(`${options.method ?? "GET"} ${url} returned ${response.status}`);
      error.body = body;
      throw error;
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function firstOrderableMenuItem(menu) {
  const item = menu.categories
    ?.flatMap((category) => category.items ?? [])
    .find((candidate) => candidate.visible !== false);

  if (!item) {
    throw new Error("No visible menu item found.");
  }

  return item;
}

function defaultRequiredSelections(item) {
  return (item.customizationGroups ?? [])
    .filter((group) => group.required || (group.minSelections ?? 0) > 0)
    .map((group) => {
      const option = (group.options ?? []).find((candidate) => candidate.default && candidate.available !== false)
        ?? (group.options ?? []).find((candidate) => candidate.available !== false);

      if (!option) {
        throw new Error(`No available option for required customization group ${group.id}.`);
      }

      return {
        groupId: group.id,
        optionId: option.id
      };
    });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function failPrerequisite(message) {
  console.error(`[dev-checkout-e2e] missing prerequisite: ${message}`);
  process.exit(2);
}
