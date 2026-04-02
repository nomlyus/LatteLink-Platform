import { describe, expect, it } from "vitest";
import {
  canAccessCapability,
  canManageOrderStatus,
  countHiddenMenuItems,
  countVisibleMenuItems,
  filterActiveOrders,
  filterOrdersByView,
  formatOrderStatus,
  getAppConfigCapabilityLabels,
  getAvailableSections,
  getOperatorRoleLabel,
  getOrderActions,
  getOrderCustomerLabel,
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
  active: true,
  capabilities: ["orders:read", "orders:write", "menu:read", "menu:visibility", "store:read", "staff:read"],
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
        priceCents: 675,
        sortOrder: 0,
        visible: true
      },
      {
        itemId: "drink-2",
        categoryId: "featured",
        categoryTitle: "Featured",
        name: "Honey Cortado",
        description: "Short milk coffee",
        priceCents: 550,
        sortOrder: 1,
        visible: false
      }
    ]
  }
];

describe("operator-web model", () => {
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

  it("filters orders by active, completed, and all views", () => {
    const orders = [sampleOrder, { ...sampleOrder, status: "COMPLETED" }, { ...sampleOrder, status: "CANCELED" }] as const;

    expect(filterOrdersByView(orders, "active").map((order) => order.status)).toEqual(["PAID"]);
    expect(filterOrdersByView(orders, "completed").map((order) => order.status)).toEqual(["COMPLETED", "CANCELED"]);
    expect(filterOrdersByView(orders, "all").map((order) => order.status)).toEqual(["PAID", "COMPLETED", "CANCELED"]);
    expect(filterOrdersByView([], "active")).toEqual([]);
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
      "Staff fulfillment",
      "Platform-managed menu",
      "Order tracking",
      "Staff dashboard",
      "Menu editing",
      "Loyalty features",
      "home tab",
      "orders tab"
    ]);

    expect(getAvailableSections(sampleOperator, sampleAppConfig)).toEqual(["overview", "orders", "menu", "store", "team"]);
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
    ).toEqual(["overview", "menu"]);
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
    ).toEqual(["overview"]);
  });

  it("resolves role labels and capability access", () => {
    expect(getOperatorRoleLabel("owner")).toBe("Store owner");
    expect(getOperatorRoleLabel("manager")).toBe("Manager");
    expect(getOperatorRoleLabel("staff")).toBe("Staff");

    expect(canAccessCapability(sampleOperator, "orders:write")).toBe(true);
    expect(canAccessCapability(sampleOperator, "staff:write")).toBe(false);
    expect(canAccessCapability(null, "orders:read")).toBe(false);
  });

  it("normalizes menu, store, and team form inputs before submission", () => {
    expect(
      normalizeMenuItemForm({
        name: "  Brown Sugar Latte  ",
        priceCents: "1250",
        visible: "yes"
      })
    ).toEqual({
      name: "Brown Sugar Latte",
      priceCents: 1250,
      visible: true
    });

    expect(
      normalizeMenuItemCreateForm({
        categoryId: " featured ",
        name: "  Honey Cortado  ",
        description: "  Bright and sweet  ",
        priceCents: "550",
        visible: "false"
      })
    ).toEqual({
      categoryId: "featured",
      name: "Honey Cortado",
      description: "Bright and sweet",
      priceCents: 550,
      visible: false
    });

    expect(
      normalizeStoreConfigForm({
        storeName: "  LatteLink Flagship  ",
        hours: "  Daily · 7:00 AM - 6:00 PM  ",
        pickupInstructions: "  Pickup at the front counter.  "
      })
    ).toEqual({
      storeName: "LatteLink Flagship",
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
