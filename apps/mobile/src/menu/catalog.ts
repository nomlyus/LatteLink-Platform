import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  appConfigSchema,
  isLoyaltyVisible,
  isOrderTrackingEnabled,
  homeNewsCardsResponseSchema,
  menuResponseSchema,
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
  type StoreConfigResponse
} from "@lattelink/contracts-catalog";
import { API_BASE_URL, CATALOG_API_BASE_URL, MOBILE_LOCATION_ID, apiClient, catalogApiClient } from "../api/client";
import { withCriticalDataLoadSentry } from "../observability/criticalDataLoad";

const catalogMenuQueryKey = ["catalog", "menu"] as const;
const catalogHomeNewsCardsQueryKey = ["catalog", "home-news-cards"] as const;
const catalogStoreConfigQueryKey = ["catalog", "store-config"] as const;
const catalogAppConfigQueryKey = ["catalog", "app-config"] as const;
const catalogStaleTimeMs = 60_000;

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

async function fetchMenu(): Promise<MenuResponse> {
  return withCriticalDataLoadSentry(
    {
      feature: "menu",
      operation: "load_menu",
      endpoint: "/menu",
      apiBaseUrl: API_BASE_URL,
      locationId: MOBILE_LOCATION_ID
    },
    async () => {
      const response = menuResponseSchema.parse(await apiClient.menu());
      return {
        ...response,
        categories: filterVisibleCategories(response)
      };
    }
  );
}

async function fetchHomeNewsCards(): Promise<HomeNewsCardsResponse> {
  return withCriticalDataLoadSentry(
    {
      feature: "home",
      operation: "load_home_news_cards",
      endpoint: "/store/cards",
      apiBaseUrl: API_BASE_URL,
      locationId: MOBILE_LOCATION_ID
    },
    async () => {
      const response = homeNewsCardsResponseSchema.parse(await apiClient.homeNewsCards());
      return {
        ...response,
        cards: response.cards.filter((card) => card.visible).sort((left, right) => left.sortOrder - right.sortOrder)
      };
    }
  );
}

async function fetchStoreConfig(): Promise<StoreConfigResponse> {
  return withCriticalDataLoadSentry(
    {
      feature: "startup",
      operation: "load_store_config",
      endpoint: "/store/config",
      apiBaseUrl: API_BASE_URL,
      locationId: MOBILE_LOCATION_ID
    },
    async () => storeConfigResponseSchema.parse(await apiClient.storeConfig())
  );
}

async function fetchAppConfig(): Promise<AppConfig> {
  return withCriticalDataLoadSentry(
    {
      feature: "startup",
      operation: "load_app_config",
      endpoint: "/app-config",
      apiBaseUrl: CATALOG_API_BASE_URL || API_BASE_URL,
      locationId: MOBILE_LOCATION_ID
    },
    async () => {
      try {
        return await apiClient.appConfig();
      } catch (primaryError) {
        try {
          return await catalogApiClient.appConfig();
        } catch {
          throw primaryError;
        }
      }
    }
  );
}

export function prefetchCatalogQueries(queryClient: QueryClient) {
  void Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: catalogMenuQueryKey,
      queryFn: fetchMenu,
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogAppConfigQueryKey,
      queryFn: fetchAppConfig,
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogStoreConfigQueryKey,
      queryFn: fetchStoreConfig,
      staleTime: catalogStaleTimeMs
    }),
    queryClient.prefetchQuery({
      queryKey: catalogHomeNewsCardsQueryKey,
      queryFn: fetchHomeNewsCards,
      staleTime: catalogStaleTimeMs
    })
  ]);
}

export function useMenuQuery() {
  return useQuery({
    queryKey: catalogMenuQueryKey,
    queryFn: fetchMenu,
    staleTime: catalogStaleTimeMs
  });
}

export function useHomeNewsCardsQuery() {
  return useQuery({
    queryKey: catalogHomeNewsCardsQueryKey,
    queryFn: fetchHomeNewsCards,
    staleTime: catalogStaleTimeMs
  });
}

export function useStoreConfigQuery() {
  return useQuery({
    queryKey: catalogStoreConfigQueryKey,
    queryFn: fetchStoreConfig,
    staleTime: catalogStaleTimeMs
  });
}

export function useAppConfigQuery() {
  return useQuery({
    queryKey: catalogAppConfigQueryKey,
    queryFn: fetchAppConfig,
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
  MenuItemCustomizationOption
};
