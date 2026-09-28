import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { state } from "../src/state";
import { resolveOrder } from "../src/model";

let renderOrdersSection: typeof import("../src/views/orders").renderOrdersSection;

const appConfig = {
  storeCapabilities: {
    menu: { source: "platform_managed" },
    operations: {
      fulfillmentMode: "staff",
      liveOrderTrackingEnabled: true,
      dashboardEnabled: true
    },
    loyalty: { visible: true }
  }
} as never;

const order = (id: string, pickupCode: string) =>
  resolveOrder({
    id,
    locationId: "loc_a",
    status: "PAID",
    items: [
      {
        itemId: "latte",
        itemName: "Latte",
        quantity: 1,
        unitPriceCents: 650,
        lineTotalCents: 650
      }
    ],
    total: { currency: "USD", amountCents: 650 },
    pickupCode,
    timeline: [{ status: "PAID", occurredAt: "2026-09-24T12:00:00.000Z" }],
    customer: { name: "Jordan Lee", email: "jordan@example.com" }
  });

afterEach(() => {
  vi.useRealTimers();
  state.session = null;
  state.selectedLocationId = null;
  state.appConfig = null;
  state.orders = [];
  state.selectedOrderId = null;
  state.orderDetailsOpen = false;
  state.orderDetailsOpening = false;
  state.orderFilter = "active";
  state.ordersPage = 1;
});

beforeAll(async () => {
  vi.stubGlobal("document", { querySelector: () => ({}) });
  ({ renderOrdersSection } = await import("../src/views/orders"));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("operator orders view", () => {
  it("renders every standard-dashboard order as a row in one full-width table", () => {
    state.session = {
      operator: {
        role: "manager",
        capabilities: ["orders:read", "orders:write", "payments:refund"]
      }
    } as never;
    state.selectedLocationId = "loc_a";
    state.appConfig = appConfig;
    state.orders = [
      order("11111111-1111-4111-8111-111111111111", "A1"),
      { ...order("22222222-2222-4222-8222-222222222222", "B2"), status: "COMPLETED" }
    ];

    const html = renderOrdersSection();

    expect(html).toContain('<table class="dash-order-table">');
    expect(html).toContain(">Details</th>");
    expect(html).toContain('aria-label="View order details for A1"');
    expect(html).toContain('class="dash-order-table__details-icon"');
    expect(html).not.toContain(">View</button>");
    expect(html).not.toContain(">Actions</th>");
    expect(html.indexOf("dash-order-toolbar")).toBeLessThan(html.indexOf('<table class="dash-order-table">'));
    expect(html).not.toContain("dash-surface-head");
    expect(html.match(/class="dash-order-table__row/g)).toHaveLength(2);
    expect(html.match(/class="dash-order-table__items">1 item<\/span>/g)).toHaveLength(2);
    expect(html).not.toContain("Latte");
    expect(html).toContain("A1");
    expect(html).toContain("B2");
    expect(html).toContain("Jordan Lee");
    expect(html).not.toContain("jordan@example.com");
    expect(html).not.toContain("Track incoming orders");
    expect(html).not.toContain('<div class="dash-panel-title">Orders</div>');
    expect(html).not.toContain("in view");
    expect(html).not.toContain('data-action="set-order-filter"');
    expect(html).not.toContain("Order detail");
    expect(html).not.toContain("dash-order-detail-surface");
    expect(html).not.toContain("dash-split-layout--orders");
  });

  it("renders the selected order in a details modal without row actions", () => {
    state.session = {
      operator: {
        role: "owner",
        capabilities: ["orders:read"]
      }
    } as never;
    state.selectedLocationId = "loc_a";
    state.appConfig = appConfig;
    state.orders = [order("11111111-1111-4111-8111-111111111111", "A1")];
    state.selectedOrderId = "11111111-1111-4111-8111-111111111111";
    state.orderDetailsOpen = true;

    const html = renderOrdersSection();

    expect(html).toContain('class="dash-modal__dialog dash-modal__dialog--order"');
    expect(html).not.toContain("dash-order-detail-modal--opening");
    expect(html).toContain('class="dash-order-detail__close-icon"');
    expect(html).not.toContain("&times;");
    expect(html).toContain('aria-labelledby="order-detail-title"');
    expect(html).toMatch(/Sep 24, 2026 • \d{1,2}:00 (AM|PM)/);
    expect(html).not.toContain("Order Details");
    expect(html).toContain("Customer Details");
    expect(html).toContain("Fulfillment");
    expect(html).toContain("Pickup");
    expect(html).toContain("Subtotal");
    expect(html).toContain("Tax");
    expect(html).toContain("Order Activity");
    expect(html).toContain("Jordan Lee");
    expect(html).toContain('href="mailto:jordan@example.com"');
    expect(html).toContain("Order Activity");
    expect(html).toContain("Read-only order details");
    expect(html).not.toContain("Start prep");
  });

  it("does not open the details modal for an automatically selected order", () => {
    state.session = {
      operator: {
        role: "owner",
        capabilities: ["orders:read"]
      }
    } as never;
    state.selectedLocationId = "loc_a";
    state.appConfig = appConfig;
    state.orders = [order("11111111-1111-4111-8111-111111111111", "A1")];
    state.selectedOrderId = "11111111-1111-4111-8111-111111111111";
    state.orderDetailsOpen = false;

    const html = renderOrdersSection();

    expect(html).not.toContain('class="dash-order-detail-modal');
  });

  it("keeps All Locations order status controls read-only", () => {
    state.session = {
      operator: {
        role: "manager",
        capabilities: ["orders:read", "orders:write", "payments:refund"]
      }
    } as never;
    state.selectedLocationId = "all";
    state.availableLocations = [{ locationId: "loc_a" }, { locationId: "loc_b" }] as never;
    state.appConfig = appConfig;
    state.orders = [order("11111111-1111-4111-8111-111111111111", "A1")];

    const html = renderOrdersSection();

    expect(html).toContain("This all-locations board is read-only");
    expect(html).not.toContain('data-action="start-prep"');
    expect(html).not.toContain('data-action="complete-order"');
  });

  it("shows only the order code without elapsed time in the selected-location Orders tab", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T00:00:00.000Z"));
    state.session = {
      operator: {
        role: "manager",
        capabilities: ["orders:read", "orders:write", "payments:refund"]
      }
    } as never;
    state.selectedLocationId = "loc_a";
    state.appConfig = appConfig;
    state.orders = [order("11111111-1111-4111-8111-111111111111", "A1")];
    state.selectedOrderId = "11111111-1111-4111-8111-111111111111";

    const html = renderOrdersSection();

    expect(html).toMatch(/<div class="dash-order-table__order">\s*<strong>A1<\/strong>\s*<\/div>/);
    expect(html).not.toContain("ago");
  });

  it("shows only the order code without elapsed time in All Orders", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T01:00:00.000Z"));
    state.session = {
      operator: {
        role: "manager",
        capabilities: ["orders:read", "orders:write", "payments:refund"]
      }
    } as never;
    state.selectedLocationId = "loc_a";
    state.appConfig = appConfig;
    state.orders = [order("11111111-1111-4111-8111-111111111111", "A1")];
    state.selectedOrderId = "11111111-1111-4111-8111-111111111111";

    const html = renderOrdersSection();

    expect(html).toMatch(/<div class="dash-order-table__order">\s*<strong>A1<\/strong>\s*<\/div>/);
    expect(html).not.toContain("ago");
  });

  it("paginates standard orders at 15 rows", () => {
    state.session = {
      operator: {
        role: "manager",
        capabilities: ["orders:read", "orders:write", "payments:refund"]
      }
    } as never;
    state.selectedLocationId = "loc_a";
    state.appConfig = appConfig;
    state.orders = Array.from({ length: 16 }, (_, index) =>
      order(`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, `P${index + 1}`)
    );

    const firstPage = renderOrdersSection();

    expect(firstPage.match(/class="dash-order-table__row/g)).toHaveLength(15);
    expect(firstPage).toContain('class="dash-order-pagination"');
    expect(firstPage.indexOf('class="dash-order-pagination"')).toBeGreaterThan(firstPage.lastIndexOf("</article>"));
    expect(firstPage.match(/class="dash-order-pagination__control/g)).toHaveLength(4);
    expect(firstPage).toContain('aria-label="First page"');
    expect(firstPage).toContain('aria-label="Previous page"');
    expect(firstPage).toContain('<span class="dash-order-pagination__page" aria-current="page">1 / 2</span>');
    expect(firstPage).toContain('aria-label="Next page"');
    expect(firstPage).toContain('aria-label="Last page"');
    expect(firstPage).toContain('data-orders-page="2"');

    state.ordersPage = 2;
    const secondPage = renderOrdersSection();

    expect(secondPage.match(/class="dash-order-table__row/g)).toHaveLength(1);
    expect(secondPage).toContain('<span class="dash-order-pagination__page" aria-current="page">2 / 2</span>');
    expect(secondPage).toContain('data-orders-page="1"');
  });
});
