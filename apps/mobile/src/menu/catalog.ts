import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  appConfigSchema,
  isLoyaltyVisible,
  isOrderTrackingEnabled,
  homeNewsCardsResponseSchema,
  menuResponseSchema,
  mobileExperienceDocumentSchema,
  storeConfigResponseSchema,
  type AppConfig,
  type HomeNewsCard,
  type HomeNewsCardsResponse,
  type MenuCategory,
  type MenuItem,
  type MenuItemCustomizationGroup,
  type MenuItemCustomizationInput,
  type MenuItemCustomizationOption,
  type MenuResponse,
  type MobileExperienceDocument,
  type StoreConfigResponse
} from "@lattelink/contracts-catalog";
import { API_BASE_URL, CATALOG_API_BASE_URL, apiClient, catalogApiClient } from "../api/client";
import { useLocationContext } from "../location/LocationProvider";
import { withCriticalDataLoadSentry } from "../observability/criticalDataLoad";

export const catalogQueryKeys = {
  menu: (locationId: string | null, brandId: string) => ["catalog", "menu", locationId, brandId] as const,
  appConfig: (locationId: string | null, brandId: string) => ["catalog", "app-config", locationId, brandId] as const,
  storeConfig: (locationId: string | null, brandId: string) => ["catalog", "store-config", locationId, brandId] as const,
  homeNewsCards: (locationId: string | null, brandId: string) => ["catalog", "home-news-cards", locationId, brandId] as const,
  mobileExperience: (locationId: string | null, brandId: string) => ["catalog", "mobile-experience", locationId, brandId] as const
};
const catalogStaleTimeMs = 60_000;

type LocationRequestContext = { brandId: string; locationId: string; signal?: AbortSignal };

function requireLocationRequestContext(brandId: string, locationId: string | null): LocationRequestContext {
  if (!brandId.trim() || !locationId?.trim()) {
    throw new Error("A selected branded-app location is required before loading catalog data.");
  }
  return { brandId, locationId };
}

export type MenuImageVariant = "list" | "hero";

function replaceLastExtension(pathname: string, nextExtension: string) {
  return pathname.replace(/\.[^/.]+$/, `.${nextExtension}`);
}

export function resolveMenuImageUrl(imageUrl: string | undefined, variant: MenuImageVariant) {
  if (!imageUrl) {
    return undefined;
  }

  try {
    const url = new URL(imageUrl);
    if (!url.pathname.includes("/menu-items/") || !url.pathname.includes("/original/")) {
      return imageUrl;
    }

    url.pathname = replaceLastExtension(
      url.pathname.replace("/original/", variant === "list" ? "/mobile-list/" : "/mobile-hero/"),
      "jpg"
    );
    return url.toString();
  } catch {
    return imageUrl;
  }
}

function filterVisibleCategories(menu: MenuResponse): MenuCategory[] {
  return menu.categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.visible)
    }))
    .filter((category) => category.items.length > 0);
}

async function fetchMenu(context: LocationRequestContext): Promise<MenuResponse> {
  return withCriticalDataLoadSentry(
    {
      feature: "menu",
      operation: "load_menu",
      endpoint: "/menu",
      apiBaseUrl: API_BASE_URL,
      locationId: context.locationId
    },
    async () => {
      const response = menuResponseSchema.parse(await apiClient.forLocation(context.locationId).menu({ signal: context.signal }));
      return {
        ...response,
        categories: filterVisibleCategories(response)
      };
    }
  );
}

async function fetchHomeNewsCards(context: LocationRequestContext): Promise<HomeNewsCardsResponse> {
  return withCriticalDataLoadSentry(
    {
      feature: "home",
      operation: "load_home_news_cards",
      endpoint: "/store/cards",
      apiBaseUrl: API_BASE_URL,
      locationId: context.locationId
    },
    async () => {
      const response = homeNewsCardsResponseSchema.parse(await apiClient.forLocation(context.locationId).homeNewsCards({ signal: context.signal }));
      return {
        ...response,
        cards: response.cards.filter((card) => card.visible).sort((left, right) => left.sortOrder - right.sortOrder)
      };
    }
  );
}

async function fetchStoreConfig(context: LocationRequestContext): Promise<StoreConfigResponse> {
  return withCriticalDataLoadSentry(
    {
      feature: "startup",
      operation: "load_store_config",
      endpoint: "/store/config",
      apiBaseUrl: API_BASE_URL,
      locationId: context.locationId
    },
    async () => storeConfigResponseSchema.parse(await apiClient.forLocation(context.locationId).storeConfig({ signal: context.signal }))
  );
}

async function fetchAppConfig(context: LocationRequestContext): Promise<AppConfig> {
  return withCriticalDataLoadSentry(
    {
      feature: "startup",
      operation: "load_app_config",
      endpoint: "/app-config",
      apiBaseUrl: CATALOG_API_BASE_URL || API_BASE_URL,
      locationId: context.locationId
    },
    async () => {
      try {
        return await apiClient.forLocation(context.locationId).appConfig({ signal: context.signal });
      } catch (primaryError) {
        try {
          return await catalogApiClient.forLocation(context.locationId).appConfig({ signal: context.signal });
        } catch {
          throw primaryError;
        }
      }
    }
  );
}

async function fetchMobileExperience(context: LocationRequestContext): Promise<MobileExperienceDocument> {
  return withCriticalDataLoadSentry(
    {
      feature: "home",
      operation: "load_mobile_experience",
      endpoint: "/mobile-experience",
      apiBaseUrl: API_BASE_URL,
      locationId: context.locationId
    },
    async () => mobileExperienceDocumentSchema.parse(await apiClient.forLocation(context.locationId).mobileExperience({ signal: context.signal }))
  );
}

export function prefetchCatalogQueries(queryClient: QueryClient, input: { brandId: string; locationId: string }) {
  const context = requireLocationRequestContext(input.brandId, input.locationId);
  void Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.menu(context.locationId, context.brandId),
      queryFn: ({ signal }) => fetchMenu({ ...context, signal }),
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.appConfig(context.locationId, context.brandId),
      queryFn: ({ signal }) => fetchAppConfig({ ...context, signal }),
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.storeConfig(context.locationId, context.brandId),
      queryFn: ({ signal }) => fetchStoreConfig({ ...context, signal }),
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.homeNewsCards(context.locationId, context.brandId),
      queryFn: ({ signal }) => fetchHomeNewsCards({ ...context, signal }),
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.mobileExperience(context.locationId, context.brandId),
      queryFn: ({ signal }) => fetchMobileExperience({ ...context, signal }),
      staleTime: catalogStaleTimeMs
    })
  ]);
}

export function useMenuQuery() {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: catalogQueryKeys.menu(selectedLocationId, brandId),
    enabled: isReady && Boolean(selectedLocationId),
    queryFn: ({ signal }) => fetchMenu({ ...requireLocationRequestContext(brandId, selectedLocationId), signal }),
    staleTime: catalogStaleTimeMs
  });
}

export function useHomeNewsCardsQuery() {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: catalogQueryKeys.homeNewsCards(selectedLocationId, brandId),
    enabled: isReady && Boolean(selectedLocationId),
    queryFn: ({ signal }) => fetchHomeNewsCards({ ...requireLocationRequestContext(brandId, selectedLocationId), signal }),
    staleTime: catalogStaleTimeMs
  });
}

export function useStoreConfigQuery() {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: catalogQueryKeys.storeConfig(selectedLocationId, brandId),
    enabled: isReady && Boolean(selectedLocationId),
    queryFn: ({ signal }) => fetchStoreConfig({ ...requireLocationRequestContext(brandId, selectedLocationId), signal }),
    staleTime: catalogStaleTimeMs
  });
}

export function useAppConfigQuery() {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: catalogQueryKeys.appConfig(selectedLocationId, brandId),
    enabled: isReady && Boolean(selectedLocationId),
    queryFn: ({ signal }) => fetchAppConfig({ ...requireLocationRequestContext(brandId, selectedLocationId), signal }),
    staleTime: catalogStaleTimeMs
  });
}

export function useMobileExperienceQuery() {
  const { brandId, selectedLocationId, isReady } = useLocationContext();
  return useQuery({
    queryKey: catalogQueryKeys.mobileExperience(selectedLocationId, brandId),
    enabled: isReady && Boolean(selectedLocationId),
    queryFn: ({ signal }) => fetchMobileExperience({ ...requireLocationRequestContext(brandId, selectedLocationId), signal }),
    staleTime: catalogStaleTimeMs
  });
}

export function resolveMenuData(menu: MenuResponse | undefined): MenuResponse | undefined {
  if (!menu || menu.categories.length === 0) {
    return undefined;
  }

  return menu;
}

export function resolveStoreConfigData(config: StoreConfigResponse | undefined): StoreConfigResponse | undefined {
  return config;
}

export function resolveAppConfigData(config: AppConfig | undefined): AppConfig | undefined {
  return config ? appConfigSchema.parse(config) : undefined;
}

export function isMobileLoyaltyVisible(config: AppConfig | undefined) {
  const resolvedConfig = resolveAppConfigData(config);
  return resolvedConfig ? isLoyaltyVisible(resolvedConfig) : false;
}

export function isMobileOrderTrackingEnabled(config: AppConfig | undefined) {
  const resolvedConfig = resolveAppConfigData(config);
  return resolvedConfig ? isOrderTrackingEnabled(resolvedConfig) : false;
}

export function createEmptyCustomizationInput(): MenuItemCustomizationInput {
  return {
    selectedOptions: [],
    notes: ""
  };
}

export function formatUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export function toCategoryById(categories: MenuCategory[]): Record<string, MenuCategory> {
  return categories.reduce<Record<string, MenuCategory>>((acc, category) => {
    acc[category.id] = category;
    return acc;
  }, {});
}

export type {
  AppConfig,
  HomeNewsCard,
  HomeNewsCardsResponse,
  MenuCategory,
  MenuItem,
  MenuItemCustomizationGroup,
  MenuItemCustomizationInput,
  MenuItemCustomizationOption,
  MobileExperienceDocument
};
