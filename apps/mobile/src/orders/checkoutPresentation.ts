import Constants from "expo-constants";
import * as Linking from "expo-linking";
import type { OrderHistoryEntry } from "../account/data";

export function resolveStripeUrlScheme() {
  const configuredScheme = Constants.expoConfig?.scheme;
  if (typeof configuredScheme === "string" && configuredScheme.trim().length > 0) return configuredScheme.trim();
  if (Array.isArray(configuredScheme)) {
    const firstScheme = configuredScheme.find((scheme) => typeof scheme === "string" && scheme.trim().length > 0);
    if (firstScheme) return firstScheme.trim();
  }

  const fallbackUrl = Linking.createURL("");
  return fallbackUrl.match(/^([a-z][a-z0-9+\-.]*):/i)?.[1];
}

export function normalizeStripeReturnUrl(url: string | undefined, scheme: string | undefined) {
  if (!url || !scheme) return undefined;
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === `${scheme}:` ? url : undefined;
  } catch {
    return undefined;
  }
}

export function resolveStripeReturnUrl(): string | undefined {
  const scheme = resolveStripeUrlScheme();
  const path = "stripe-redirect";
  if (scheme) return normalizeStripeReturnUrl(Linking.createURL(path, { scheme }), scheme);
  return normalizeStripeReturnUrl(
    Constants.appOwnership === "expo" ? Linking.createURL(`/--/${path}`) : Linking.createURL(path),
    resolveStripeUrlScheme()
  );
}

export function buildCheckoutOrderHistoryEntry(params: {
  order: {
    id: string;
    pickupCode: string;
    items: OrderHistoryEntry["items"];
    total: OrderHistoryEntry["total"];
  };
  status: OrderHistoryEntry["status"];
  occurredAt: string;
}): OrderHistoryEntry {
  return {
    id: params.order.id,
    pickupCode: params.order.pickupCode,
    status: params.status,
    items: params.order.items,
    total: params.order.total,
    timeline: [{ status: params.status, occurredAt: params.occurredAt }]
  };
}
