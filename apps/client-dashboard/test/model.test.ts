import { describe, expect, it } from "vitest";
import {
  canAdvanceOrderStatus,
  canAccessCapability,
  canCancelOrder,
  canCreateMenuItems,
  canManageOrderStatus,
  canManageTeamMembers,
  canToggleMenuItemVisibility,
  canUpdateStoreSettings,
  countHiddenMenuItems,
  countVisibleMenuItems,
  filterActiveOrders,
  filterOrdersByView,
  filterVisibleOrders,
  formatOrderStatus,
  getAppConfigCapabilityLabels,
  getAvailableSections,
  getOrderCancelUnavailableMessage,
  getOrderControlUnavailableMessage,
  getOperatorRoleLabel,
  getOrderActions,
  getOrderCustomerLabel,
  isAbortedCheckoutOrder,
  isActiveOrder,
  normalizeMenuItemCreateForm,
  normalizeMenuItemForm,
  normalizeOperatorUserCreateForm,
  normalizeOperatorUserUpdateForm,
  normalizeStoreConfigForm,
  resolveAppConfig,
  resolveOrder,
  sessionNeedsRefresh,
  type OperatorMenuCategory,
  type OperatorUser
} from "../src/model";

const sampleOrder = resolveOrder({
  id: "123e4567-e89b-12d3-a456-426614174000",
  locationId: "flagship-01",
  status: "PAID",
  items: [],
  total: { currency: "USD", amountCents: 1200 },
  pickupCode: "A1B2C3",
  timeline: [{ status: "PENDING_PAYMENT", occurredAt: "2026-03-20T00:00:00.000Z" }],
  customer: {
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "555-0101"
  }
});

const sampleAppConfig = resolveAppConfig({
  brand: {
    brandId: "lattelink-default",
    brandName: "LatteLink",
    locationId: "flagship-01",
    locationName: "LatteLink Flagship",
    marketLabel: "Ann Arbor, MI"
  },
  theme: {
    background: "#09090f",
    backgroundAlt: "#0d0e16",
    surface: "#111320",
    surfaceMuted: "#181a28",
    foreground: "#f0f2f8",
    foregroundMuted: "#8892aa",
    muted: "#5a6278",
    border: "rgba(240, 242, 248, 0.08)",
    primary: "#2a5fff",
    accent: "#4a7eff",
    fontFamily: "DM Sans",
    displayFontFamily: "Syne"
  },
  enabledTabs: ["home", "orders"],
  featureFlags: {
    loyalty: false,
    pushNotifications: false,
    refunds: false,
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
  },
  storeCapabilities: {
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

const sampleOperator: OperatorUser = {
  operatorUserId: "11111111-1111-4111-8111-111111111111",
  displayName: "Avery Quinn",
  email: "avery@store.com",
  role: "manager",
  locationId: "flagship-01",
  locationIds: ["flagship-01", "northside-01"],
  active: true,
  capabilities: ["orders:read", "orders:write", "menu:read", "menu:visibility", "store:read", "team:read"],
  createdAt: "2026-03-20T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z"
};

const sampleMenuCategories: OperatorMenuCategory[] = [
  {
    categoryId: "featured",
    title: "Featured",
    items: [
      {
        itemId: "drink-1",
        categoryId: "featured",
        categoryTitle: "Featured",
        name: "Brown Sugar Latte",
        description: "Sweet espresso latte",
        imageUrl: "https://media.example.com/drink-1.jpg",
        priceCents: 675,
        sortOrder: 0,
        visible: true,
        customizationGroups: []
      },
      {
        itemId: "drink-2",
        categoryId: "featured",
        categoryTitle: "Featured",
        name: "Honey Cortado",
        description: "Short milk coffee",
        imageUrl: undefined,
        priceCents: 550,
        sortOrder: 1,
        visible: false,
        customizationGroups: []
      }
    ]
  }
];

describe("client dashboard model", () => {
  it("derives order actions and active-order filtering from status", () => {
    expect(getOrderActions(sampleOrder, "staff").map((action) => action.status)).toEqual(["IN_PREP"]);
    expect(getOrderActions({ ...sampleOrder, status: "IN_PREP" }, "staff").map((action) => action.status)).toEqual([
      "READY"
    ]);
    expect(getOrderActions({ ...sampleOrder, status: "READY" }, "staff").map((action) => action.status)).toEqual([
      "COMPLETED"
    ]);
    expect(getOrderActions(sampleOrder, "time_based")).toEqual([]);
    expect(canManageOrderStatus(sampleAppConfig)).toBe(true);
    expect(
      canManageOrderStatus({
        ...sampleAppConfig,
        storeCapabilities: {
          ...sampleAppConfig.storeCapabilities,
          operations: {
            ...sampleAppConfig.storeCapabilities.operations,
            fulfillmentMode: "time_based"
          }
        }
      })
    ).toBe(false);

    expect(isActiveOrder(sampleOrder)).toBe(true);
    expect(isActiveOrder({ ...sampleOrder, status: "COMPLETED" })).toBe(false);
    expect(filterActiveOrders([sampleOrder, { ...sampleOrder, status: "COMPLETED" }]).map((order) => order.status)).toEqual([
      "PAID"
    ]);
  });

  it("allows canceling unpaid orders even when manual staff fulfillment is disabled", () => {
    const timeBasedConfig = {
      ...sampleAppConfig,
      storeCapabilities: {
        ...sampleAppConfig.storeCapabilities,
        operations: {
          ...sampleAppConfig.storeCapabilities.operations,
          fulfillmentMode: "time_based" as const
        }
      }
    };

    expect(canCancelOrder(sampleOperator, timeBasedConfig, { ...sampleOrder, status: "PENDING_PAYMENT" })).toBe(true);
    expect(getOrderCancelUnavailableMessage(sampleOperator, timeBasedConfig, { ...sampleOrder, status: "PENDING_PAYMENT" })).toBeNull();
    expect(canCancelOrder(sampleOperator, timeBasedConfig, sampleOrder)).toBe(false);
    expect(getOrderCancelUnavailableMessage(sampleOperator, timeBasedConfig, sampleOrder)).toBe(
      "Time-based fulfillment is active, so manual order controls are disabled."
    );
  });

  it("filters orders by active, completed, and all views", () => {
    const orders = [sampleOrder, { ...sampleOrder, status: "COMPLETED" }, { ...sampleOrder, status: "CANCELED" }] as const;

    expect(filterOrdersByView(orders, "active").map((order) => order.status)).toEqual(["PAID"]);
    expect(filterOrdersByView(orders, "completed").map((order) => order.status)).toEqual(["COMPLETED", "CANCELED"]);
    expect(filterOrdersByView(orders, "all").map((order) => order.status)).toEqual(["PAID", "COMPLETED", "CANCELED"]);
    expect(filterOrdersByView([], "active")).toEqual([]);
  });

  it("hides canceled unpaid checkout attempts from operator order lists", () => {
    const abortedCheckout = resolveOrder({
      ...sampleOrder,
      id: "123e4567-e89b-12d3-a456-426614174099",
      status: "CANCELED",
      timeline: [
        { status: "PENDING_PAYMENT", occurredAt: "2026-03-20T00:00:00.000Z" },
        {
          status: "CANCELED",
          occurredAt: "2026-03-20T00:01:00.000Z",
          note: "Customer abandoned checkout before payment confirmation"
        }
      ]
    });

    expect(isAbortedCheckoutOrder(abortedCheckout)).toBe(true);
    expect(filterVisibleOrders([sampleOrder, abortedCheckout])).toEqual([sampleOrder]);
  });

  it("formats statuses and customer labels for the dashboard", () => {
    expect(formatOrderStatus("IN_PREP")).toBe("IN PREP");
    expect(getOrderCustomerLabel(sampleOrder)).toBe("Jordan Lee · jordan@example.com · 555-0101");
    expect(getOrderCustomerLabel({ ...sampleOrder, customer: undefined })).toBe("Customer details unavailable");
  });

  it("derives capability labels and available sections from runtime config", () => {
    expect(getAppConfigCapabilityLabels(sampleAppConfig)).toEqual([
      "Apple Pay",
      "Card",
      "Refunds",
      "Clover",
      "Loyalty",
      "In-store ticket flow",
      "Platform-managed menu",
      "Order tracking",
      "Store mode",
      "Menu editing",
      "Loyalty features",
      "home tab",
      "orders tab"
    ]);

    expect(getAvailableSections(sampleOperator, sampleAppConfig)).toEqual([
      "overview",
      "orders",
      "menu",
      "cards",
      "store",
      "team"
    ]);
    expect(
      getAvailableSections(
        { ...sampleOperator, capabilities: ["menu:read"] },
        {
          ...sampleAppConfig,
          storeCapabilities: {
            ...sampleAppConfig.storeCapabilities,
            operations: {
              ...sampleAppConfig.storeCapabilities.operations,
              liveOrderTrackingEnabled: false
            }
          }
        }
      )
    ).toEqual(["overview", "menu", "cards"]);
    expect(
      getAvailableSections(
        { ...sampleOperator, capabilities: ["menu:read"] },
        {
          ...sampleAppConfig,
          storeCapabilities: {
            ...sampleAppConfig.storeCapabilities,
            menu: {
              source: "external_sync"
            }
          }
        }
      )
    ).toEqual(["overview", "cards"]);
  });

  it("resolves role labels and capability access", () => {
    expect(getOperatorRoleLabel("owner")).toBe("Store owner");
    expect(getOperatorRoleLabel("manager")).toBe("Manager");
    expect(getOperatorRoleLabel("store")).toBe("Store screen");

    expect(canAccessCapability(sampleOperator, "orders:write")).toBe(true);
    expect(canAccessCapability(sampleOperator, "team:write")).toBe(false);
    expect(canAccessCapability(null, "orders:read")).toBe(false);
  });

  it("derives dashboard write access from capabilities and store config", () => {
    expect(canAdvanceOrderStatus(sampleOperator, sampleAppConfig)).toBe(true);
    expect(canCreateMenuItems(sampleOperator, sampleAppConfig)).toBe(false);
    expect(canToggleMenuItemVisibility(sampleOperator, sampleAppConfig)).toBe(true);
    expect(canUpdateStoreSettings(sampleOperator)).toBe(false);
    expect(canManageTeamMembers(sampleOperator)).toBe(false);

    expect(
      getOrderControlUnavailableMessage(
        { ...sampleOperator, capabilities: ["orders:read"] },
        sampleAppConfig
      )
    ).toBe("You have read-only access to live orders for this store.");

    expect(
      getOrderControlUnavailableMessage(sampleOperator, {
        ...sampleAppConfig,
        storeCapabilities: {
          ...sampleAppConfig.storeCapabilities,
          operations: {
            ...sampleAppConfig.storeCapabilities.operations,
            fulfillmentMode: "time_based"
          }
        }
      })
    ).toBe("Time-based fulfillment is active, so manual order controls are disabled.");

    expect(
      getOrderControlUnavailableMessage(sampleOperator, {
        ...sampleAppConfig,
        storeCapabilities: {
          ...sampleAppConfig.storeCapabilities,
          operations: {
            ...sampleAppConfig.storeCapabilities.operations,
            liveOrderTrackingEnabled: false
          }
        }
      })
    ).toBe("Live order tracking is disabled for this store.");
  });

  it("normalizes menu, store, and team form inputs before submission", () => {
    expect(
      normalizeMenuItemForm({
        name: "  Brown Sugar Latte  ",
        priceCents: "1250",
        visible: "yes",
        imageUrl: null,
        customizationGroups: [
          {
            id: "milk",
            label: "Milk",
            selectionType: "single",
            required: true,
            sortOrder: 0,
            options: [
              {
                id: "whole",
                label: "Whole milk",
                priceDeltaCents: 0,
                default: true,
                available: true,
                sortOrder: 0
              }
            ]
          }
        ]
      })
    ).toEqual({
      name: "Brown Sugar Latte",
      priceCents: 1250,
      visible: true,
      imageUrl: null,
      customizationGroups: [
        {
          id: "milk",
          label: "Milk",
          selectionType: "single",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 0,
          options: [
            {
              id: "whole",
              label: "Whole milk",
              priceDeltaCents: 0,
              default: true,
              sortOrder: 0,
              available: true
            }
          ]
        }
      ]
    });

    expect(
      normalizeMenuItemCreateForm({
        categoryId: " featured ",
        name: "  Honey Cortado  ",
        description: "  Bright and sweet  ",
        imageUrl: " https://media.example.com/honey-cortado.jpg ",
        priceCents: "550",
        visible: "false"
      })
    ).toEqual({
      categoryId: "featured",
      name: "Honey Cortado",
      description: "Bright and sweet",
      imageUrl: "https://media.example.com/honey-cortado.jpg",
      priceCents: 550,
      visible: false
    });

    expect(
      normalizeStoreConfigForm({
        storeName: "  LatteLink Flagship  ",
        locationName: "  Ann Arbor, MI  ",
        hours: "  Daily · 7:00 AM - 6:00 PM  ",
        pickupInstructions: "  Pickup at the front counter.  "
      })
    ).toEqual({
      storeName: "LatteLink Flagship",
      locationName: "Ann Arbor, MI",
      hours: "Daily · 7:00 AM - 6:00 PM",
      pickupInstructions: "Pickup at the front counter."
    });

    expect(
      normalizeOperatorUserCreateForm({
        displayName: "  Avery Quinn  ",
        email: "  avery@store.com  ",
        role: "manager",
        password: "  Password123!  "
      })
    ).toEqual({
      displayName: "Avery Quinn",
      email: "avery@store.com",
      role: "manager",
      password: "Password123!"
    });

    expect(
      normalizeOperatorUserUpdateForm({
        displayName: "  Avery Q.  ",
        password: "  NewPassword123!  ",
        active: "false"
      })
    ).toEqual({
      displayName: "Avery Q.",
      password: "NewPassword123!",
      active: false
    });
  });

  it("counts menu visibility and refresh windows correctly", () => {
    expect(countVisibleMenuItems(sampleMenuCategories)).toBe(1);
    expect(countHiddenMenuItems(sampleMenuCategories)).toBe(1);

    expect(sessionNeedsRefresh(new Date(Date.now() + 30_000).toISOString())).toBe(true);
    expect(sessionNeedsRefresh(new Date(Date.now() + 5 * 60_000).toISOString())).toBe(false);
  });
});
