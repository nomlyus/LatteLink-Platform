import { describe, expect, it } from "vitest";
import {
  adminMenuItemSchema,
  adminMenuItemUpdateSchema,
  adminStoreConfigSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  buildDefaultCustomizationInput,
  catalogContract,
  describeCustomizationSelection,
  internalLocationBootstrapSchema,
  internalLocationSummarySchema,
  isLoyaltyVisible,
  isOrderTrackingEnabled,
  isPlatformManagedMenu,
  menuResponseSchema,
  priceMenuItemCustomization,
  resolveAppConfigFulfillmentMode,
  resolveMenuItemCustomization,
  storeConfigResponseSchema
} from "../src";

const espressoGroups = [
  {
    id: "size",
    label: "Size",
    selectionType: "single" as const,
    required: true,
    sortOrder: 0,
    options: [
      { id: "regular", label: "Regular", priceDeltaCents: 0, default: true },
      { id: "large", label: "Large", priceDeltaCents: 100 }
    ]
  },
  {
    id: "milk",
    label: "Milk",
    selectionType: "single" as const,
    required: true,
    sortOrder: 1,
    options: [
      { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true },
      { id: "oat", label: "Oat milk", priceDeltaCents: 75 }
    ]
  },
  {
    id: "toppings",
    label: "Toppings",
    selectionType: "multiple" as const,
    minSelections: 0,
    maxSelections: 2,
    sortOrder: 2,
    options: [
      { id: "cinnamon", label: "Cinnamon", priceDeltaCents: 25 },
      { id: "cold-foam", label: "Cold foam", priceDeltaCents: 150 }
    ]
  }
];

describe("contracts-catalog", () => {
  it("validates menu payload", () => {
    const payload = menuResponseSchema.parse({
      locationId: "flagship-01",
      currency: "USD",
      categories: [
        {
          id: "coffee",
          title: "Coffee",
          items: [
            {
              id: "latte",
              name: "Latte",
              description: "Espresso with steamed milk.",
              priceCents: 575,
              badgeCodes: ["popular"],
              visible: true
            }
          ]
        }
      ]
    });

    expect(payload.currency).toBe("USD");
    expect(payload.categories[0]?.items[0]?.name).toBe("Latte");
  });

  it("validates store config payload", () => {
    const config = storeConfigResponseSchema.parse({
      locationId: "flagship-01",
      prepEtaMinutes: 12,
      taxRateBasisPoints: 600,
      pickupInstructions: "Pickup at the flagship order counter."
    });

    expect(config.taxRateBasisPoints).toBe(600);
  });

  it("validates app config payload", () => {
    const config = appConfigSchema.parse({
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
        mode: "staff",
        timeBasedScheduleMinutes: {
          inPrep: 5,
          ready: 10,
          completed: 15
        }
      }
    });

    expect(config.brand.marketLabel).toBe("Ann Arbor, MI");
    expect(config.fulfillment.mode).toBe("staff");
    expect(config.storeCapabilities.menu.source).toBe("external_sync");
    expect(isPlatformManagedMenu(config)).toBe(false);
    expect(isOrderTrackingEnabled(config)).toBe(true);
    expect(isLoyaltyVisible(config)).toBe(true);
    expect(resolveAppConfigFulfillmentMode(config)).toBe("staff");
  });

  it("defaults fulfillment config for older app-config payloads", () => {
    const config = appConfigSchema.parse({
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
      }
    });

    expect(config.fulfillment.mode).toBe("time_based");
    expect(config.fulfillment.timeBasedScheduleMinutes.ready).toBe(10);
  });

  it("exposes app-config contract metadata", () => {
    expect(catalogContract.routes.appConfig.path).toBe("/app-config");
  });

  it("validates admin menu and store config payloads", () => {
    const adminItem = adminMenuItemSchema.parse({
      itemId: "latte",
      categoryId: "espresso",
      categoryTitle: "Espresso Bar",
      name: "Honey Oat Latte",
      description: "Espresso with oat milk",
      priceCents: 675,
      visible: true,
      sortOrder: 0
    });
    const adminStoreConfig = adminStoreConfigSchema.parse({
      locationId: "flagship-01",
      storeName: "Gazelle Coffee Flagship",
      hours: "Daily · 7:00 AM - 6:00 PM",
      pickupInstructions: "Pickup at the flagship order counter."
    });

    expect(adminItem.categoryTitle).toBe("Espresso Bar");
    expect(adminStoreConfig.storeName).toBe("Gazelle Coffee Flagship");
    expect(adminStoreConfig.capabilities.operations.dashboardEnabled).toBe(true);
  });

  it("validates admin update payloads", () => {
    const menuUpdate = adminMenuItemUpdateSchema.parse({
      name: "Iced Cortado",
      priceCents: 575,
      visible: false
    });
    const storeUpdate = adminStoreConfigUpdateSchema.parse({
      storeName: "Gazelle Coffee Downtown",
      hours: "Weekdays · 6:30 AM - 5:00 PM",
      pickupInstructions: "Use the front pickup shelves.",
      capabilities: {
        menu: {
          source: "external_sync"
        },
        operations: {
          fulfillmentMode: "staff",
          liveOrderTrackingEnabled: false,
          dashboardEnabled: false
        },
        loyalty: {
          visible: false
        }
      }
    });

    expect(menuUpdate.visible).toBe(false);
    expect(storeUpdate.hours).toContain("Weekdays");
    expect(storeUpdate.capabilities?.menu.source).toBe("external_sync");
    expect(catalogContract.routes.adminMenu.path).toBe("/admin/menu");
    expect(catalogContract.routes.adminStoreConfig.path).toBe("/admin/store/config");
  });

  it("validates internal location bootstrap and summary payloads", () => {
    const bootstrap = internalLocationBootstrapSchema.parse({
      brandId: "northside-coffee",
      brandName: "Northside Coffee",
      locationId: "northside-01",
      locationName: "Northside Flagship",
      marketLabel: "Detroit, MI",
      capabilities: {
        menu: {
          source: "platform_managed"
        },
        operations: {
          fulfillmentMode: "staff",
          liveOrderTrackingEnabled: true,
          dashboardEnabled: true
        },
        loyalty: {
          visible: true
        }
      }
    });

    const summary = internalLocationSummarySchema.parse({
      ...bootstrap,
      storeName: "Northside Coffee",
      hours: "Daily · 7:00 AM - 6:00 PM",
      pickupInstructions: "Pickup at the espresso counter.",
      capabilities: bootstrap.capabilities,
      action: "created"
    });

    expect(summary.locationId).toBe("northside-01");
    expect(summary.action).toBe("created");
  });

  it("rejects invalid store tax rate", () => {
    expect(() =>
      storeConfigResponseSchema.parse({
        locationId: "flagship-01",
        prepEtaMinutes: 12,
        taxRateBasisPoints: 10001,
        pickupInstructions: "Pickup at the flagship order counter."
      })
    ).toThrow();
  });

  it("builds defaults for required single-select groups", () => {
    const defaults = buildDefaultCustomizationInput(espressoGroups);

    expect(defaults.selectedOptions).toEqual([
      { groupId: "milk", optionId: "whole" },
      { groupId: "size", optionId: "regular" }
    ]);
  });

  it("accepts valid required single-select selections", () => {
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection: {
        selectedOptions: [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "oat" }
        ]
      }
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.customizationDeltaCents).toBe(175);
  });

  it("rejects missing required groups", () => {
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection: {
        selectedOptions: [{ groupId: "size", optionId: "large" }]
      }
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.issues.some((issue) => issue.code === "group_missing_required" && issue.groupId === "milk")).toBe(true);
  });

  it("accepts valid multi-select groups within limits", () => {
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection: {
        selectedOptions: [
          { groupId: "size", optionId: "regular" },
          { groupId: "milk", optionId: "whole" },
          { groupId: "toppings", optionId: "cinnamon" },
          { groupId: "toppings", optionId: "cold-foam" }
        ]
      }
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.customizationDeltaCents).toBe(175);
  });

  it("rejects selections over maxSelections", () => {
    const resolved = resolveMenuItemCustomization({
      groups: [
        {
          id: "extras",
          label: "Extras",
          selectionType: "multiple" as const,
          maxSelections: 1,
          options: [
            { id: "one", label: "One", priceDeltaCents: 50 },
            { id: "two", label: "Two", priceDeltaCents: 75 }
          ]
        }
      ],
      selection: {
        selectedOptions: [
          { groupId: "extras", optionId: "one" },
          { groupId: "extras", optionId: "two" }
        ]
      }
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.issues.some((issue) => issue.code === "group_above_max")).toBe(true);
  });

  it("prices multiple option deltas and quantity", () => {
    const priced = priceMenuItemCustomization({
      basePriceCents: 675,
      quantity: 3,
      groups: espressoGroups,
      selection: {
        selectedOptions: [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "oat" },
          { groupId: "toppings", optionId: "cinnamon" }
        ]
      }
    });

    expect(priced.unitPriceCents).toBe(875);
    expect(priced.lineTotalCents).toBe(2625);
  });

  it("supports items with no customization groups", () => {
    const resolved = resolveMenuItemCustomization({
      groups: [],
      selection: {
        notes: "warm it up"
      }
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.groupSelections).toEqual([]);
    expect(resolved.customizationDeltaCents).toBe(0);
    expect(resolved.input.notes).toBe("warm it up");
  });

  it("describes selections in customization group order", () => {
    const selection = {
      selectedOptions: [
        { groupId: "milk", optionId: "oat" },
        { groupId: "size", optionId: "large" },
        { groupId: "toppings", optionId: "cold-foam" },
        { groupId: "toppings", optionId: "cinnamon" }
      ],
      notes: ""
    };
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection
    });

    expect(
      describeCustomizationSelection({
        selection,
        groupSelections: resolved.groupSelections,
        groupOrder: ["size", "milk", "toppings"],
        includeNotes: false
      })
    ).toBe("Large · Oat milk · Cinnamon, Cold foam");
  });
});
