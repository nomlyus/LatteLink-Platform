import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "../api/client";

const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  badgeCodes: z.array(z.string()),
  visible: z.boolean()
});

const menuCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(menuItemSchema)
});

const menuResponseSchema = z.object({
  locationId: z.string(),
  currency: z.literal("USD"),
  categories: z.array(menuCategorySchema)
});

const storeConfigResponseSchema = z.object({
  locationId: z.string(),
  prepEtaMinutes: z.number().int().positive(),
  taxRateBasisPoints: z.number().int().min(0).max(10000),
  pickupInstructions: z.string()
});

export type MenuItem = z.output<typeof menuItemSchema>;
export type MenuCategory = z.output<typeof menuCategorySchema>;
export type MenuResponse = z.output<typeof menuResponseSchema>;
export type StoreConfigResponse = z.output<typeof storeConfigResponseSchema>;

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
          description: "Espresso with steamed oat milk and honey drizzle.",
          priceCents: 675,
          badgeCodes: ["popular"],
          visible: true
        },
        {
          id: "flat-white",
          name: "Flat White",
          description: "Velvety microfoam over ristretto espresso shots.",
          priceCents: 625,
          badgeCodes: [],
          visible: true
        }
      ]
    },
    {
      id: "cold",
      title: "Cold Drinks",
      items: [
        {
          id: "cold-brew",
          name: "Single-Origin Cold Brew",
          description: "Twelve-hour steep with rotating single-origin beans.",
          priceCents: 550,
          badgeCodes: ["seasonal"],
          visible: true
        },
        {
          id: "matcha",
          name: "Ceremonial Matcha",
          description: "Stone-ground matcha whisked to order with milk of choice.",
          priceCents: 725,
          badgeCodes: ["new"],
          visible: true
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
          description: "Flaky and laminated daily in-house.",
          priceCents: 425,
          badgeCodes: [],
          visible: true
        }
      ]
    }
  ]
});

const fallbackStoreConfig = storeConfigResponseSchema.parse({
  locationId: "flagship-01",
  prepEtaMinutes: 12,
  taxRateBasisPoints: 600,
  pickupInstructions: "Pickup at the flagship order counter."
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

export function useStoreConfigQuery() {
  return useQuery({
    queryKey: ["catalog", "store-config"],
    queryFn: async (): Promise<StoreConfigResponse> =>
      storeConfigResponseSchema.parse(await apiClient.get<unknown>("/store/config")),
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
