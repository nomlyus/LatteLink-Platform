import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartItem } from "../src/cart/model";
import { useCheckoutController } from "../src/orders/useCheckoutController";
import { CheckoutSubmissionError, toQuoteItems } from "../src/orders/checkout";

const runtime = vi.hoisted(() => ({
  refs: [] as { current: unknown }[], states: [] as unknown[], refIndex: 0, stateIndex: 0,
  effects: [] as (() => void | (() => void))[],
  cart: { items: [] as ReturnType<typeof createCartItem>[], locationId: "location-1", subtotalCents: 500, discountCode: "" },
  location: { selectedLocationId: "location-1", brandId: "brand-1" },
  auth: { isAuthenticated: true, session: { userId: "customer-1" } },
  capabilities: { stripe: { enabled: true, onboarded: true }, card: true, applePay: true },
  prepare: vi.fn(), initialize: vi.fn(), present: vi.fn(), finalize: vi.fn(), clear: vi.fn(), quote: vi.fn(),
  retry: vi.fn(), clearRetry: vi.fn(), clearFailure: vi.fn(), confirmation: vi.fn(), failure: vi.fn(), pendingConfirmation: vi.fn(),
  navigate: vi.fn(), invalidate: vi.fn(), history: vi.fn()
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useRef: (initial: unknown) => {
    const index = runtime.refIndex++;
    return runtime.refs[index] ?? (runtime.refs[index] = { current: initial });
  },
  useState: (initial: unknown) => {
    const index = runtime.stateIndex++;
    if (!(index in runtime.states)) runtime.states[index] = initial;
    return [runtime.states[index], (value: unknown) => { runtime.states[index] = value; }];
  },
  useEffect: (effect: () => void | (() => void)) => runtime.effects.push(effect),
  useMemo: (factory: () => unknown) => factory()
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: runtime.navigate, back: runtime.navigate, dismissTo: runtime.navigate, canGoBack: () => true }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: runtime.invalidate, setQueryData: runtime.history }) }));
vi.mock("@stripe/stripe-react-native", () => ({
  PaymentSheetError: { Canceled: "Canceled" }, initStripe: vi.fn(), initPaymentSheet: runtime.initialize, presentPaymentSheet: runtime.present
}));
vi.mock("../src/auth/session", () => ({ useAuthSession: () => runtime.auth }));
vi.mock("../src/cart/store", () => ({ useCart: () => ({ ...runtime.cart, clear: runtime.clear, setDiscountCode: vi.fn() }) }));
vi.mock("../src/location/LocationProvider", () => ({ useLocationContext: () => runtime.location }));
vi.mock("../src/api/client", () => ({ apiClient: { finalizeStripeMobilePayment: runtime.finalize, quoteOrder: runtime.quote } }));
vi.mock("../src/menu/catalog", () => ({
  useAppConfigQuery: () => ({ data: { paymentCapabilities: runtime.capabilities, brand: { brandName: "Test Coffee" } } }),
  useStoreConfigQuery: () => ({ data: { isOpen: true, taxRateBasisPoints: 600, prepEtaMinutes: 10 } }),
  resolveAppConfigData: (value: unknown) => value, resolveStoreConfigData: (value: unknown) => value,
  formatUsd: (cents: number) => `$${(cents / 100).toFixed(2)}`
}));
vi.mock("../src/orders/checkout", async (original) => ({
  ...(await original<typeof import("../src/orders/checkout")>()),
  useStripeCheckoutMutation: () => ({ mutateAsync: runtime.prepare, isPending: false, reset: vi.fn() })
}));
vi.mock("../src/orders/flow", () => ({ useCheckoutFlow: () => ({
  retryOrder: null, clearRetryOrder: runtime.clearRetry, clearFailure: runtime.clearFailure,
  setConfirmation: runtime.confirmation, setFailure: runtime.failure, setRetryOrder: runtime.retry,
  setPaymentConfirmationPending: runtime.pendingConfirmation
}) }));
vi.mock("../src/orders/applePay", () => ({ resolveConfiguredApplePayMerchantIdentifier: () => "merchant.test" }));
vi.mock("../src/orders/checkoutPresentation", () => ({
  resolveStripeReturnUrl: () => "test://stripe-redirect", resolveStripeUrlScheme: () => "test",
  buildCheckoutOrderHistoryEntry: ({ order }: { order: unknown }) => order
}));
vi.mock("../src/account/data", () => ({ orderHistoryQueryKey: (brand: string) => ["account", brand], mergeOrderIntoHistory: vi.fn() }));

function render() {
  runtime.refIndex = 0; runtime.stateIndex = 0; runtime.effects = [];
  return useCheckoutController();
}
function prepared(discountCode = runtime.cart.discountCode) {
  return {
    checkout: {
      checkoutId: "checkout-1", locationId: "location-1", quoteItems: toQuoteItems(runtime.cart.items), discountCode,
      total: { currency: "USD", amountCents: 475 },
      quote: { subtotal: { currency: "USD", amountCents: 600 }, tax: { currency: "USD", amountCents: 25 }, discount: { currency: "USD", amountCents: 150 } }
    },
    paymentSession: { paymentIntentId: "intent-test", paymentIntentClientSecret: "test-only", publishableKey: "test-only", stripeAccountId: "test-only", merchantDisplayName: "Test Coffee", merchantCountryCode: "US", applePayEnabled: true }
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks(); runtime.refs = []; runtime.states = [];
  runtime.cart = { items: [createCartItem({ menuItemId: "coffee", itemName: "Coffee", basePriceCents: 500, quantity: 1, customizationGroups: [] })], locationId: "location-1", subtotalCents: 500, discountCode: "" };
  runtime.location = { selectedLocationId: "location-1", brandId: "brand-1" };
  runtime.auth = { isAuthenticated: true, session: { userId: "customer-1" } };
  runtime.capabilities = { stripe: { enabled: true, onboarded: true }, card: true, applePay: true };
  runtime.quote.mockReset();
  runtime.prepare.mockImplementation(async (input: { discountCode?: string }) => prepared(input.discountCode ?? ""));
  runtime.initialize.mockResolvedValue({}); runtime.present.mockResolvedValue({});
  runtime.finalize.mockResolvedValue({ order: { id: "order-test", pickupCode: "123", status: "PAID", total: { currency: "USD", amountCents: 475 }, items: [] } });
});

describe("payment directly from Cart", () => {
  it("keeps the Pay label when a discount code has not been applied", () => {
    runtime.cart.discountCode = "SAVE10";
    expect(render().payActionLabel).toBe("Pay $5.30");
  });
  it("updates the total from Apply without creating a checkout or presenting payment", async () => {
    runtime.cart.discountCode = "SAVE10";
    runtime.quote.mockResolvedValue({
      locationId: "location-1", appliedDiscountCode: { code: "SAVE10", discountCents: 150 },
      subtotal: { amountCents: 600 }, tax: { amountCents: 25 }, discount: { amountCents: 150 }, total: { amountCents: 475 }
    });
    await render().discount.apply();
    expect(render().pricingSummary).toEqual({ subtotalCents: 600, taxCents: 25, discountCents: 150, totalCents: 475 });
    expect(render().payActionLabel).toBe("Pay $4.75");
    expect(runtime.prepare).not.toHaveBeenCalled();
    expect(runtime.present).not.toHaveBeenCalled();
    await render().handleStripeCheckout();
    expect(runtime.prepare).toHaveBeenCalledWith(expect.objectContaining({ discountCode: "SAVE10" }));
  });
  it("opens Stripe at the regular price after Apply rejects a code", async () => {
    runtime.cart.discountCode = "INVALID";
    runtime.quote.mockRejectedValue(new Error('Request failed: {"message":"This code is invalid."}'));
    await render().discount.apply();
    expect(render().discount.error).toBe("This code is invalid.");
    expect(render().pricingSummary.discountCents).toBe(0);
    await render().handleStripeCheckout();
    expect(runtime.prepare).toHaveBeenCalledWith(expect.objectContaining({ discountCode: undefined }));
    expect(runtime.present).toHaveBeenCalledOnce();
    expect(runtime.failure).not.toHaveBeenCalled();
  });
  it("does not send a merely typed code to payment", async () => {
    runtime.cart.discountCode = "NOT_APPLIED";
    await render().handleStripeCheckout();
    expect(runtime.prepare).toHaveBeenCalledWith(expect.objectContaining({ discountCode: undefined }));
    expect(runtime.present).toHaveBeenCalledOnce();
  });
  it("uses backend finalization values, initializes Apple Pay, and clears only after confirmation", async () => {
    await render().handleStripeCheckout();
    expect(runtime.initialize).toHaveBeenCalledWith(expect.objectContaining({ applePay: { merchantCountryCode: "US" }, returnURL: "test://stripe-redirect" }));
    expect(runtime.finalize).toHaveBeenCalledWith({ checkoutId: "checkout-1", paymentIntentId: "intent-test" });
    expect(runtime.confirmation).toHaveBeenCalledWith(expect.objectContaining({ total: { currency: "USD", amountCents: 475 } }));
    expect(runtime.clear).toHaveBeenCalledOnce();
    expect(runtime.clear.mock.invocationCallOrder[0]).toBeGreaterThan(runtime.finalize.mock.invocationCallOrder[0]);
    expect(runtime.navigate).not.toHaveBeenCalled();
  });
  it("guards duplicate taps synchronously and exposes the edit lock until the attempt finishes", async () => {
    const pending = deferred<ReturnType<typeof prepared>>();
    runtime.prepare.mockReturnValue(pending.promise);
    const controller = render();
    const first = controller.handleStripeCheckout();
    await controller.handleStripeCheckout();
    expect(controller.isPaymentInFlight()).toBe(true);
    expect(render().paymentInProgress).toBe(true);
    expect(render().payActionLabel).toBe("Preparing secure payment…");
    expect(runtime.prepare).toHaveBeenCalledOnce();
    pending.resolve(prepared()); await first;
    expect(controller.isPaymentInFlight()).toBe(false);
    expect(render().paymentInProgress).toBe(false);
  });
  it("keeps Cart and its contents on cancellation and retains an authoritative retry", async () => {
    runtime.present.mockResolvedValue({ error: { code: "Canceled" } });
    await render().handleStripeCheckout();
    expect(runtime.clear).not.toHaveBeenCalled(); expect(runtime.finalize).not.toHaveBeenCalled();
    expect(runtime.retry).toHaveBeenCalledOnce(); expect(runtime.navigate).not.toHaveBeenCalled();
    expect(render().authoritativeTotal).toBe(475);
    expect(render().pricingSummary).toEqual({ subtotalCents: 600, taxCents: 25, discountCents: 150, totalCents: 475 });
  });
  it.each(["signed-out", "provider-disabled", "provider-not-onboarded", "no-methods"])("does not start payment for %s", async (condition) => {
    if (condition === "signed-out") runtime.auth.isAuthenticated = false;
    if (condition === "provider-disabled") runtime.capabilities.stripe.enabled = false;
    if (condition === "provider-not-onboarded") runtime.capabilities.stripe.onboarded = false;
    if (condition === "no-methods") { runtime.capabilities.applePay = false; runtime.capabilities.card = false; }
    await render().handleStripeCheckout();
    expect(runtime.prepare).not.toHaveBeenCalled(); expect(runtime.present).not.toHaveBeenCalled();
  });
  it.each(["location", "customer", "discount", "cart"])("rejects a stale %s before presenting payment", async (scope) => {
    const pending = deferred<ReturnType<typeof prepared>>(); const snapshot = prepared();
    runtime.prepare.mockReturnValue(pending.promise);
    const attempt = render().handleStripeCheckout();
    if (scope === "location") runtime.location.selectedLocationId = "location-2";
    if (scope === "customer") runtime.auth.session.userId = "customer-2";
    if (scope === "discount") runtime.cart.discountCode = "NEW";
    if (scope === "cart") runtime.cart.items = [];
    render(); pending.resolve(snapshot); await attempt;
    expect(runtime.present).not.toHaveBeenCalled(); expect(runtime.clear).not.toHaveBeenCalled();
  });
  it("ignores a disposed checkout preparation", async () => {
    const pending = deferred<ReturnType<typeof prepared>>(); runtime.prepare.mockReturnValue(pending.promise);
    const controller = render();
    const disposers = runtime.effects.map((effect) => effect());
    const attempt = controller.handleStripeCheckout();
    for (const dispose of disposers) if (typeof dispose === "function") dispose();
    pending.resolve(prepared()); await attempt;
    expect(runtime.present).not.toHaveBeenCalled(); expect(runtime.clear).not.toHaveBeenCalled();
  });
  it.each(["initialization", "payment"])("keeps cart editable for retry after %s failure", async (stage) => {
    if (stage === "initialization") runtime.initialize.mockResolvedValue({ error: { message: "Unavailable" } });
    else runtime.present.mockResolvedValue({ error: { code: "Failed" } });
    await render().handleStripeCheckout();
    expect(runtime.finalize).not.toHaveBeenCalled(); expect(runtime.clear).not.toHaveBeenCalled();
    expect(render().paymentInProgress).toBe(false); expect(runtime.retry).toHaveBeenCalledOnce();
  });
  it("uses the pending-confirmation outcome instead of inviting another payment after finalization fails", async () => {
    runtime.finalize.mockRejectedValue(new Error("Network unavailable"));
    await render().handleStripeCheckout();
    expect(runtime.pendingConfirmation).toHaveBeenCalledOnce();
    expect(runtime.confirmation).not.toHaveBeenCalled(); expect(runtime.retry).not.toHaveBeenCalled();
    expect(runtime.clear).toHaveBeenCalledOnce();
  });
  it("does not clear a different cart if context changes while the native payment sheet is open", async () => {
    const pending = deferred<object>(); runtime.present.mockReturnValue(pending.promise);
    const attempt = render().handleStripeCheckout();
    await vi.waitFor(() => expect(runtime.present).toHaveBeenCalledOnce());
    runtime.cart.locationId = "location-2"; runtime.location.selectedLocationId = "location-2"; render();
    pending.resolve({}); await attempt;
    expect(runtime.finalize).toHaveBeenCalledOnce(); expect(runtime.clear).not.toHaveBeenCalled();
  });
  it("keeps quote rejection inline instead of calling it a failed payment", async () => {
    runtime.prepare.mockRejectedValue(new CheckoutSubmissionError("Invalid discount", "quote"));
    await render().handleStripeCheckout();
    expect(runtime.failure).not.toHaveBeenCalled();
    expect(render().statusMessage).toBe("Invalid discount");
    expect(runtime.confirmation).not.toHaveBeenCalled(); expect(runtime.clear).not.toHaveBeenCalled();
  });
});
