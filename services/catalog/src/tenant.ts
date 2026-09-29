import {
  DEFAULT_APP_CONFIG_STORE_CAPABILITIES,
  DEFAULT_APP_CONFIG_FULFILLMENT,
  appConfigFulfillmentModeSchema,
  appConfigSchema,
  type AppConfigStoreCapabilities,
  type AppConfig
} from "@lattelink/contracts-catalog";

// Rawaq values are confined to explicitly enabled local/test catalog fixtures.
export const LOCAL_FIXTURE_BRAND_ID = "rawaqcoffee";
export const LOCAL_FIXTURE_LOCATION_ID = "rawaqcoffee01";
export const LOCAL_FIXTURE_BRAND_NAME = "Rawaq Coffee";
export const LOCAL_FIXTURE_LOCATION_NAME = "Rawaq Coffee Flagship";
export const LOCAL_FIXTURE_MARKET_LABEL = "Ann Arbor, MI";
export const DEFAULT_STORE_HOURS = "Daily · 7:00 AM - 6:00 PM";

function trimToUndefined(value: string | undefined) {
  const next = value?.trim();
  return next && next.length > 0 ? next : undefined;
}

export function resolveOperatorFallbackLocationId(env: Record<string, string | undefined> = process.env): string | undefined {
  return trimToUndefined(env.CATALOG_DEFAULT_LOCATION_ID);
}

function resolveConfiguredFulfillmentMode(value: string | undefined) {
  const normalized = trimToUndefined(value)?.toLowerCase().replaceAll("-", "_");
  const parsed = appConfigFulfillmentModeSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  return DEFAULT_APP_CONFIG_FULFILLMENT.mode;
}

type CatalogBrandLocation = {
  brandId: string;
  brandName: string;
  locationId: string;
  locationName: string;
  marketLabel: string;
};

function buildAppConfigPayload(
  identity: CatalogBrandLocation,
  env: Record<string, string | undefined>
): AppConfig {
  return appConfigSchema.parse({
    brand: {
      brandId: identity.brandId,
      brandName: identity.brandName,
      locationId: identity.locationId,
      locationName: identity.locationName,
      marketLabel: identity.marketLabel
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
      background: "#F7F4ED",
      foreground: "#171513"
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
      stripe: {
        enabled: false,
        onboarded: false,
        dashboardEnabled: false
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

function configuredSeedIdentity(env: Record<string, string | undefined>): CatalogBrandLocation {
  const identity = {
    brandId: trimToUndefined(env.CATALOG_DEFAULT_BRAND_ID),
    brandName: trimToUndefined(env.CATALOG_DEFAULT_BRAND_NAME),
    locationId: trimToUndefined(env.CATALOG_DEFAULT_LOCATION_ID),
    locationName: trimToUndefined(env.CATALOG_DEFAULT_LOCATION_NAME),
    marketLabel: trimToUndefined(env.CATALOG_DEFAULT_MARKET_LABEL)
  };
  const missing = Object.entries(identity).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Catalog seed identity requires explicit CATALOG_DEFAULT_* values: ${missing.join(", ")}.`);
  }

  return identity as CatalogBrandLocation;
}

export function resolveDefaultAppConfigPayload(
  env: Record<string, string | undefined> = process.env
): AppConfig {
  return buildAppConfigPayload(configuredSeedIdentity(env), env);
}

export function resolveLocalFixtureAppConfigPayload(
  env: Record<string, string | undefined> = process.env
): AppConfig {
  const isVitest = env.NODE_ENV === "test" && env.VITEST === "true";
  const isExplicitLocalMemoryMode = env.NODE_ENV !== "production" && env.ALLOW_IN_MEMORY_PERSISTENCE === "true";
  if (!isVitest && !isExplicitLocalMemoryMode) {
    throw new Error("The Rawaq catalog fixture requires Vitest or explicit local in-memory persistence.");
  }
  return buildAppConfigPayload({
    brandId: LOCAL_FIXTURE_BRAND_ID,
    brandName: LOCAL_FIXTURE_BRAND_NAME,
    locationId: LOCAL_FIXTURE_LOCATION_ID,
    locationName: LOCAL_FIXTURE_LOCATION_NAME,
    marketLabel: LOCAL_FIXTURE_MARKET_LABEL
  }, env);
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
  const capabilities = input.capabilities ?? DEFAULT_APP_CONFIG_STORE_CAPABILITIES;
  const base = buildAppConfigPayload({
    brandId: input.brandId.trim(),
    brandName: input.brandName.trim(),
    locationId: input.locationId.trim(),
    locationName: input.locationName.trim(),
    marketLabel: input.marketLabel.trim()
  }, env);

  return appConfigSchema.parse({
    ...base,
    fulfillment: {
      ...base.fulfillment,
      mode: capabilities.operations.fulfillmentMode
    },
    storeCapabilities: capabilities
  });
}
