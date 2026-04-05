import { useQuery } from "@tanstack/react-query";
import {
  appConfigSchema,
  isLoyaltyVisible,
  isOrderTrackingEnabled,
  homeNewsCardsResponseSchema,
  menuItemCustomizationGroupSchema,
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
} from "@gazelle/contracts-catalog";
import { apiClient, catalogApiClient } from "../api/client";

const sizeGroup: MenuItemCustomizationGroup = menuItemCustomizationGroupSchema.parse({
  id: "size",
  sourceGroupId: "core:size",
  label: "Size",
  description: "Choose the pour size for this drink.",
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  sortOrder: 0,
  displayStyle: "chips",
  options: [
    {
      id: "regular",
      label: "Regular",
      priceDeltaCents: 0,
      default: true,
      sortOrder: 0,
      available: true
    },
    {
      id: "large",
      label: "Large",
      priceDeltaCents: 100,
      default: false,
      sortOrder: 1,
      available: true
    }
  ]
});

const milkGroup: MenuItemCustomizationGroup = menuItemCustomizationGroupSchema.parse({
  id: "milk",
  sourceGroupId: "core:milk",
  label: "Milk",
  description: "Pick the texture and finish you want.",
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  sortOrder: 1,
  displayStyle: "chips",
  options: [
    {
      id: "whole",
      label: "Whole milk",
      priceDeltaCents: 0,
      default: true,
      sortOrder: 0,
      available: true
    },
    {
      id: "oat",
      label: "Oat milk",
      priceDeltaCents: 75,
      default: false,
      sortOrder: 1,
      available: true
    },
    {
      id: "almond",
      label: "Almond milk",
      priceDeltaCents: 75,
      default: false,
      sortOrder: 2,
      available: true
    }
  ]
});

const sweetnessGroup: MenuItemCustomizationGroup = menuItemCustomizationGroupSchema.parse({
  id: "sweetness",
  sourceGroupId: "core:sweetness",
  label: "Sweetness",
  description: "Control how much sweetness is whisked in.",
  selectionType: "single",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  sortOrder: 2,
  displayStyle: "chips",
  options: [
    {
      id: "full",
      label: "Full sweet",
      priceDeltaCents: 0,
      default: true,
      sortOrder: 0,
      available: true
    },
    {
      id: "half",
      label: "Half sweet",
      priceDeltaCents: 0,
      default: false,
      sortOrder: 1,
      available: true
    },
    {
      id: "unsweetened",
      label: "Unsweetened",
      priceDeltaCents: 0,
      default: false,
      sortOrder: 2,
      available: true
    }
  ]
});

const espressoExtrasGroup: MenuItemCustomizationGroup = menuItemCustomizationGroupSchema.parse({
  id: "espresso-extras",
  label: "Extras",
  description: "Add a little more structure or finish.",
  selectionType: "multiple",
  required: false,
  minSelections: 0,
  maxSelections: 2,
  sortOrder: 3,
  displayStyle: "chips",
  options: [
    {
      id: "extra-shot",
      label: "Extra shot",
      priceDeltaCents: 125,
      default: false,
      sortOrder: 0,
      available: true
    },
    {
      id: "vanilla",
      label: "Vanilla",
      priceDeltaCents: 75,
      default: false,
      sortOrder: 1,
      available: true
    }
  ]
});

const matchaFinishGroup: MenuItemCustomizationGroup = menuItemCustomizationGroupSchema.parse({
  id: "matcha-finish",
  label: "Finish",
  description: "Choose the final matcha texture.",
  selectionType: "multiple",
  required: false,
  minSelections: 0,
  maxSelections: 1,
  sortOrder: 3,
  displayStyle: "chips",
  options: [
    {
      id: "strawberry-cold-foam",
      label: "Strawberry cold foam",
      priceDeltaCents: 150,
      default: false,
      sortOrder: 0,
      available: true
    }
  ]
});

export const reusableCustomizationGroups = {
  size: sizeGroup,
  milk: milkGroup,
  sweetness: sweetnessGroup
} as const;

export const exampleCustomizationByItemId: Record<string, MenuItemCustomizationGroup[]> = {
  latte: [sizeGroup, milkGroup, espressoExtrasGroup],
  matcha: [sizeGroup, milkGroup, sweetnessGroup, matchaFinishGroup],
  croissant: []
};

const fallbackMenu = menuResponseSchema.parse({
  locationId: "flagship-01",
  currency: "USD",
  categories: [
    {
      id: "espresso",
      title: "Espresso Bar",
      items: [
        {
          id: "latte",
          name: "Honey Oat Latte",
          description: "Espresso with steamed oat milk and a warm honey finish.",
          priceCents: 675,
          badgeCodes: ["popular"],
          visible: true,
          customizationGroups: exampleCustomizationByItemId.latte
        }
      ]
    },
    {
      id: "matcha",
      title: "Matcha",
      items: [
        {
          id: "matcha",
          name: "Ceremonial Matcha",
          description: "Stone-ground matcha whisked to order with milk of your choice.",
          priceCents: 725,
          badgeCodes: ["new"],
          visible: true,
          customizationGroups: exampleCustomizationByItemId.matcha
        }
      ]
    },
    {
      id: "pastry",
      title: "Pastries",
      items: [
        {
          id: "croissant",
          name: "Butter Croissant",
          description: "Flaky, laminated, and baked fresh each morning.",
          priceCents: 425,
          badgeCodes: [],
          visible: true,
          customizationGroups: exampleCustomizationByItemId.croissant
        }
      ]
    }
  ]
});

const fallbackStoreConfig = storeConfigResponseSchema.parse({
  locationId: "flagship-01",
  hoursText: "Daily · 7:00 AM - 6:00 PM",
  isOpen: true,
  nextOpenAt: null,
  prepEtaMinutes: 12,
  taxRateBasisPoints: 600,
  pickupInstructions: "Pickup at the flagship order counter."
});

const fallbackAppConfig = appConfigSchema.parse({
  brand: {
    brandId: "gazelle-default",
    brandName: "Gazelle Coffee",
    locationId: "flagship-01",
    locationName: "Gazelle Coffee Flagship",
    marketLabel: "Ann Arbor, MI"
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
  enabledTabs: ["home", "menu", "orders", "account"],
  featureFlags: {
    loyalty: true,
    pushNotifications: true,
    refunds: true,
    orderTracking: true,
    staffDashboard: false,
    menuEditing: false
  },
  loyaltyEnabled: true,
  paymentCapabilities: {
    applePay: true,
    card: true,
    cash: false,
    refunds: true,
    clover: {
      enabled: true,
      merchantRef: "flagship-01"
    }
  },
  fulfillment: {
    mode: "time_based",
    timeBasedScheduleMinutes: {
      inPrep: 5,
      ready: 10,
      completed: 15
    }
  },
  storeCapabilities: {
    menu: {
      source: "platform_managed"
    },
    operations: {
      fulfillmentMode: "time_based",
      liveOrderTrackingEnabled: true,
      dashboardEnabled: false
    },
    loyalty: {
      visible: true
    }
  }
});

function filterVisibleCategories(menu: MenuResponse): MenuCategory[] {
  return menu.categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.visible)
    }))
    .filter((category) => category.items.length > 0);
}

export function useMenuQuery() {
  return useQuery({
    queryKey: ["catalog", "menu"],
    queryFn: async (): Promise<MenuResponse> => {
      const response = menuResponseSchema.parse(await apiClient.get<unknown>("/menu"));
      return {
        ...response,
        categories: filterVisibleCategories(response)
      };
    },
    staleTime: 60_000
  });
}

export function useHomeNewsCardsQuery() {
  return useQuery({
    queryKey: ["catalog", "home-news-cards"],
    queryFn: async (): Promise<HomeNewsCardsResponse> => {
      const response = homeNewsCardsResponseSchema.parse(await apiClient.get<unknown>("/store/cards"));
      return {
        ...response,
        cards: response.cards.filter((card) => card.visible).sort((left, right) => left.sortOrder - right.sortOrder)
      };
    },
    staleTime: 60_000
  });
}

export function useStoreConfigQuery() {
  return useQuery({
    queryKey: ["catalog", "store-config"],
    queryFn: async (): Promise<StoreConfigResponse> =>
      storeConfigResponseSchema.parse(await apiClient.get<unknown>("/store/config")),
    staleTime: 60_000
  });
}

export function useAppConfigQuery() {
  return useQuery({
    queryKey: ["catalog", "app-config"],
    queryFn: async (): Promise<AppConfig> => {
      try {
        return await apiClient.appConfig();
      } catch (primaryError) {
        try {
          return await catalogApiClient.appConfig();
        } catch {
          if (!__DEV__) {
            throw primaryError;
          }
          return fallbackAppConfig;
        }
      }
    },
    staleTime: 60_000
  });
}

export function resolveMenuData(menu: MenuResponse | undefined): MenuResponse {
  if (!menu || menu.categories.length === 0) {
    return fallbackMenu;
  }

  return menu;
}

export function resolveStoreConfigData(config: StoreConfigResponse | undefined): StoreConfigResponse {
  return config ?? fallbackStoreConfig;
}

export function resolveAppConfigData(config: AppConfig | undefined): AppConfig {
  return config ? appConfigSchema.parse(config) : fallbackAppConfig;
}

export function isMobileLoyaltyVisible(config: AppConfig | undefined) {
  return isLoyaltyVisible(resolveAppConfigData(config));
}

export function isMobileOrderTrackingEnabled(config: AppConfig | undefined) {
  return isOrderTrackingEnabled(resolveAppConfigData(config));
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
