import {
  mobileBrandBootstrapSchema,
  storeConfigResponseSchema,
  type AppConfig,
  type InternalLocationSummary,
  type MobileBrandBootstrap,
  type OnboardingSummary,
  type StoreConfigResponse
} from "@lattelink/contracts-catalog";

const launchReadinessChecklistIds = [
  "owner_invited",
  "owner_activated",
  "business_profile_complete",
  "store_operations_complete",
  "app_identity_ready",
  "payments_connected",
  "menu_ready",
  "team_configured_or_skipped",
  "test_order_completed",
  "mobile_release_ready",
  "admin_launch_approved"
] as const;

export type MobileBrandRecord = {
  tenantId: string;
  brandId: string;
  displayName: string;
};

export type MobileBrandLocationMembership = {
  tenantId: string;
  brandId: string;
  locationId: string;
  locationName: string;
  marketLabel: string;
  timezone: string;
  primaryLocation: boolean;
};

export class MobileBrandBootstrapConfigurationError extends Error {
  constructor() {
    super("Mobile brand bootstrap configuration is inconsistent.");
    this.name = "MobileBrandBootstrapConfigurationError";
  }
}

export function isCustomerLocationLaunchable(input: {
  brand: MobileBrandRecord;
  membership: MobileBrandLocationMembership;
  onboarding?: Pick<
    OnboardingSummary,
    "tenantId" | "brandId" | "locationId" | "status" | "liveAt" | "blockedReason" | "checklist"
  >;
  appConfig?: Pick<AppConfig, "brand">;
  storeConfig?: StoreConfigResponse;
  locationSummary?: Pick<
    InternalLocationSummary,
    "brandId" | "locationId" | "hours" | "capabilities"
  >;
}) {
  const { brand, membership, onboarding, appConfig, storeConfig, locationSummary } = input;
  // Repository reads parse this same contract; it permits zero tax and rejects malformed/out-of-range values.
  const parsedStoreConfig = storeConfig === undefined ? undefined : storeConfigResponseSchema.safeParse(storeConfig);
  return (
    membership.tenantId === brand.tenantId &&
    membership.brandId === brand.brandId &&
    onboarding?.tenantId === brand.tenantId &&
    onboarding.brandId === brand.brandId &&
    onboarding.locationId === membership.locationId &&
    appConfig?.brand.brandId === brand.brandId &&
    appConfig.brand.locationId === membership.locationId &&
    parsedStoreConfig?.success === true &&
    parsedStoreConfig.data.locationId === membership.locationId &&
    onboarding.status === "live" &&
    Boolean(onboarding.liveAt) &&
    !onboarding.blockedReason &&
    onboarding.checklist.length === launchReadinessChecklistIds.length &&
    launchReadinessChecklistIds.every((id) => onboarding.checklist.some((check) => check.id === id && check.passed)) &&
    onboarding.checklist.every((check) => check.passed) &&
    locationSummary?.brandId === brand.brandId &&
    locationSummary.locationId === membership.locationId &&
    locationSummary.hours.trim().length > 0 &&
    locationSummary.capabilities.operations.fulfillmentMode === "staff"
  );
}

function parseBootstrap(input: unknown): MobileBrandBootstrap {
  const parsed = mobileBrandBootstrapSchema.safeParse(input);
  if (!parsed.success) {
    throw new MobileBrandBootstrapConfigurationError();
  }
  return parsed.data;
}

export function buildMobileBrandBootstrap(input: {
  brand: MobileBrandRecord;
  memberships: MobileBrandLocationMembership[];
  launchableLocationIds: ReadonlySet<string>;
}): MobileBrandBootstrap {
  const { brand, memberships, launchableLocationIds } = input;
  const uniqueLocationIds = new Set<string>();
  for (const membership of memberships) {
    if (
      membership.tenantId !== brand.tenantId ||
      membership.brandId !== brand.brandId ||
      uniqueLocationIds.has(membership.locationId)
    ) {
      throw new MobileBrandBootstrapConfigurationError();
    }
    uniqueLocationIds.add(membership.locationId);
  }

  for (const locationId of launchableLocationIds) {
    if (!uniqueLocationIds.has(locationId)) {
      throw new MobileBrandBootstrapConfigurationError();
    }
  }

  const unavailable = () =>
    parseBootstrap({
      schemaVersion: 1,
      status: "unavailable",
      brand: { brandId: brand.brandId, displayName: brand.displayName },
      locations: [],
      primaryLocationId: null,
      orderingEnabled: false,
      compatibility: {}
    });

  const launchableLocations = memberships.filter((membership) => launchableLocationIds.has(membership.locationId));
  if (launchableLocations.length === 0) {
    return unavailable();
  }

  let primaryLocationId: string;
  if (launchableLocations.length === 1) {
    primaryLocationId = launchableLocations[0]!.locationId;
  } else {
    const persistedPrimaries = memberships.filter((membership) => membership.primaryLocation);
    if (persistedPrimaries.length !== 1 || !launchableLocationIds.has(persistedPrimaries[0]!.locationId)) {
      throw new MobileBrandBootstrapConfigurationError();
    }
    primaryLocationId = persistedPrimaries[0]!.locationId;
  }

  return parseBootstrap({
    schemaVersion: 1,
    status: "ready",
    brand: { brandId: brand.brandId, displayName: brand.displayName },
    locations: launchableLocations
      .slice()
      .sort((left, right) => left.locationName.localeCompare(right.locationName) || left.locationId.localeCompare(right.locationId))
      .map((location) => ({
        locationId: location.locationId,
        displayName: location.locationName,
        marketLabel: location.marketLabel,
        timezone: location.timezone
      })),
    primaryLocationId,
    orderingEnabled: true,
    compatibility: {}
  });
}
