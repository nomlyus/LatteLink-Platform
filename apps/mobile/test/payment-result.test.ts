import { describe, expect, it } from "vitest";
import { confirmationPresentation, failurePresentation } from "../src/orders/paymentResult";
import { previewConfirmation, previewFailure } from "../src/dev/designPreviews";

describe("payment outcome presentation", () => {
  it("never invents a successful order from an empty state", () => {
    expect(confirmationPresentation(null, false)).toMatchObject({ title: "Check your orders", confirmed: false });
    expect(confirmationPresentation(previewConfirmation, false).confirmed).toBe(true);
  });
  it("does not encourage a second charge while confirmation is pending", () => {
    for (const state of [confirmationPresentation(null, true), confirmationPresentation({ ...previewConfirmation, status: "PENDING_PAYMENT" }, false)]) {
      expect(state.confirmed).toBe(false);
      expect(state.message).toContain("before trying to pay again");
    }
  });
  it.each(["CANCELED", "REFUNDED", "PARTIALLY_REFUNDED"] as const)("doesn't call a %s order confirmed", (status) => {
    expect(confirmationPresentation({ ...previewConfirmation, status }, false).confirmed).toBe(false);
  });
  it("distinguishes checkout preparation from payment and avoids unverified charge claims", () => {
    expect(failurePresentation({ ...previewFailure, stage: "quote" }).title).toBe("Unable to prepare checkout");
    const interrupted = failurePresentation(previewFailure);
    expect(interrupted.message).toContain("Check Orders");
    expect(interrupted.message).not.toMatch(/Nothing was charged|No order was placed/);
  });
});
