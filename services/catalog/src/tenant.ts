import {
  DEFAULT_APP_CONFIG_STORE_CAPABILITIES,
  DEFAULT_APP_CONFIG_FULFILLMENT,
  appConfigFulfillmentModeSchema,
  appConfigSchema,
  type AppConfigStoreCapabilities,
  type AppConfig
} from "@lattelink/contracts-catalog";

export const DEFAULT_BRAND_ID = "rawaqcoffee";
export const DEFAULT_LOCATION_ID = "rawaqcoffee01";
export const DEFAULT_BRAND_NAME = "Rawaq Coffee";
export const DEFAULT_LOCATION_NAME = "Rawaq Coffee Flagship";
export const DEFAULT_MARKET_LABEL = "Ann Arbor, MI";
export const DEFAULT_STORE_HOURS = "Daily · 7:00 AM - 6:00 PM";

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

function resolveConfiguredFulfillmentMode(value: string | undefined) {
  const normalized = trimToUndefined(value)?.toLowerCase().replaceAll("-", "_");
  const parsed = appConfigFulfillmentModeSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return DEFAULT_APP_CONFIG_FULFILLMENT.mode;
}

export function resolveDefaultAppConfigPayload(
  env: Record<string, string | undefined> = process.env
): AppConfig {
  return appConfigSchema.parse({
    brand: {
      brandId: DEFAULT_BRAND_ID,
      brandName: DEFAULT_BRAND_NAME,
      locationId: DEFAULT_LOCATION_ID,
      locationName: DEFAULT_LOCATION_NAME,
      marketLabel: DEFAULT_MARKET_LABEL
    },
    theme: {
      background: "#F7F4ED",
      backgroundAlt: "#F0ECE4",
      surface: "#FFFDF8",
      surfaceMuted: "#F3EFE7",
      foreground: "#171513",
      foregroundMuted: "#605B55",
      muted: "#9B9389",
      border: "rgba(23, 21, 19, 0.08)",
      primary: "#1E1B18",
      accent: "#2D2823",
      fontFamily: "System",
      displayFontFamily: "Fraunces"
    },
    header: {
      background: "#F0ECE4"
    },
    enabledTabs: ["home", "menu", "orders", "account"],
    featureFlags: {
      loyalty: true,
      pushNotifications: true,
      refunds: true,
      orderTracking: true,
      staffDashboard: true,
      menuEditing: true
    },
    loyaltyEnabled: true,
    paymentCapabilities: {
      applePay: true,
      card: true,
      cash: false,
      refunds: true,
      clover: {
        enabled: true,
        merchantRef: DEFAULT_LOCATION_ID
      }
    },
    fulfillment: {
      ...DEFAULT_APP_CONFIG_FULFILLMENT,
      mode: resolveConfiguredFulfillmentMode(env.ORDER_FULFILLMENT_MODE)
    },
    storeCapabilities: {
      ...DEFAULT_APP_CONFIG_STORE_CAPABILITIES,
      operations: {
        ...DEFAULT_APP_CONFIG_STORE_CAPABILITIES.operations,
        fulfillmentMode: resolveConfiguredFulfillmentMode(env.ORDER_FULFILLMENT_MODE)
      }
    }
  });
}

export function resolveProvisionedAppConfigPayload(
  input: {
    brandId: string;
    brandName: string;
    locationId: string;
    locationName: string;
    marketLabel: string;
    capabilities?: AppConfigStoreCapabilities;
  },
  env: Record<string, string | undefined> = process.env
): AppConfig {
  const base = resolveDefaultAppConfigPayload(env);
  const capabilities = input.capabilities ?? base.storeCapabilities;

  return appConfigSchema.parse({
    ...base,
    brand: {
      brandId: input.brandId.trim(),
      brandName: input.brandName.trim(),
      locationId: input.locationId.trim(),
      locationName: input.locationName.trim(),
      marketLabel: input.marketLabel.trim()
    },
    paymentCapabilities: {
      ...base.paymentCapabilities,
      clover: {
        ...base.paymentCapabilities.clover,
        merchantRef: input.locationId.trim()
      }
    },
    fulfillment: {
      ...base.fulfillment,
      mode: capabilities.operations.fulfillmentMode
    },
    storeCapabilities: capabilities
  });
}

export const defaultAppConfigPayload: AppConfig = resolveDefaultAppConfigPayload();
