import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { discountCodeSchema } from "@lattelink/contracts-orders";
import { describe, expect, it, vi } from "vitest";
import { DiscountsPage } from "../src/features/discounts/components/DiscountsPage";
import { DiscountEditorDialog } from "../src/features/discounts/components/DiscountEditorDialog";
import type { useDiscountMutations } from "../src/features/discounts/use-discount-mutations";

const code = discountCodeSchema.parse({
  discountCodeId: "11111111-1111-4111-8111-111111111111",
  locationId: "location-a",
  code: "WELCOME10",
  name: "Welcome offer",
  type: "percent",
  value: 10,
  maxDiscountCents: 500,
  minSubtotalCents: 1200,
  eligibility: "first_order_only",
  oncePerCustomer: true,
  maxTotalRedemptions: 100,
  active: true,
  startsAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  redeemedCount: 12,
  reservedCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z"
});

const noop = () => undefined;
const mutations = {
  pendingOperation: null,
  isMutating: false,
  error: null,
  notice: null,
  clearMessages: noop,
  createDiscountCode: vi.fn(async () => true),
  updateDiscountCode: vi.fn(async () => true)
} as unknown as ReturnType<typeof useDiscountMutations>;

function page(overrides: Partial<React.ComponentProps<typeof DiscountsPage>> = {}) {
  return <DiscountsPage
    discountCodes={[code]}
    loadStatus="ready"
    loadError={null}
    selectedLocationId="location-a"
    scopeKey="operator:location-a"
    canWrite
    mutations={mutations}
    onRetry={noop}
    {...overrides}
  />;
}

describe("React Discounts workspace", () => {
  it("renders loading, failed, empty, and location-scoped states distinctly", () => {
    expect(renderToStaticMarkup(page({ discountCodes: null, loadStatus: "loading" }))).toContain("Loading discount codes");
    expect(renderToStaticMarkup(page({ discountCodes: null, loadStatus: "error", loadError: "Service unavailable" }))).toContain("Service unavailable");
    expect(renderToStaticMarkup(page({ discountCodes: [] }))).toContain("No discount codes yet");
    const allLocations = renderToStaticMarkup(page({ selectedLocationId: "all" }));
    expect(allLocations).toContain("Choose one location");
    expect(allLocations).not.toContain("+ Create code");
  });

  it("renders a compact table with authoritative details and no page-local filters", () => {
    const html = renderToStaticMarkup(page());
    expect(html).toContain("Discount codes");
    expect(html).toContain("WELCOME10");
    expect(html).toContain("Welcome offer");
    expect(html).toContain("12 redeemed · 2 reserved · 100 total limit");
    expect(html).toContain("Created");
    expect(html).toContain('aria-label="Discount codes"');
    expect(html).not.toContain('id="discount-code-search"');
    expect(html).not.toContain('id="discount-code-status-filter"');
    expect(html).not.toContain("Create checkout codes with");
    expect(html).toContain('aria-label="Edit WELCOME10"');
    expect(html).not.toContain(code.discountCodeId);
  });

  it("paginates 15 rows and searches all loaded discount metadata", () => {
    const discountCodes = Array.from({ length: 20 }, (_, index) => ({ ...code, discountCodeId: `test-${index}`, code: `OFFER${index}`, name: `Offer ${index}` }));
    const html = renderToStaticMarkup(page({ discountCodes }));
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(15);
    expect(html).toContain("1–15 of 20");
    expect(html).toContain('aria-label="Discounts pagination"');
    expect(renderToStaticMarkup(page({ discountCodes, query: "OFFER19 10%" }))).toContain("OFFER19");
    expect(renderToStaticMarkup(page({ query: "first order 12 redeemed" }))).toContain("WELCOME10");
    expect(renderToStaticMarkup(page({ query: "not-found" }))).toContain("No codes match this search");
  });

  it("keeps review available while hiding mutations without write capability", () => {
    const html = renderToStaticMarkup(page({ canWrite: false }));
    expect(html).toContain("editing is disabled");
    expect(html).toContain('aria-label="View WELCOME10"');
    expect(html).not.toContain("+ Create code");
  });

  it("renders supported create/edit fields and a read-only editor", () => {
    const create = renderToStaticMarkup(<DiscountEditorDialog discountCode={null} canWrite pending={false} error={null} onClose={noop} onCreate={async () => true} onUpdate={async () => true} />);
    expect(create).toContain("Create discount code");
    expect(create).toContain('name="code"');
    expect(create).toContain("Customer eligibility");
    expect(create).toContain("Maximum total redemptions");
    expect(create).toContain("Schedule times use your browser’s local timezone");

    const edit = renderToStaticMarkup(<DiscountEditorDialog discountCode={code} canWrite pending={false} error={null} onClose={noop} onCreate={async () => true} onUpdate={async () => true} />);
    expect(edit).toContain("Edit discount code");
    expect(edit).toContain("WELCOME10");
    expect(edit).toContain('value="1200"');
    expect(edit).toContain("Save changes");

    const readOnly = renderToStaticMarkup(<DiscountEditorDialog discountCode={code} canWrite={false} pending={false} error={null} onClose={noop} onCreate={async () => true} onUpdate={async () => true} />);
    expect(readOnly).toContain("review this code");
    expect(readOnly).not.toContain("Save changes");
  });
});
