import type { CheckoutConfirmation, CheckoutFailure } from "./flow";

export function confirmationPresentation(confirmation: CheckoutConfirmation | null, pending: boolean) {
  if (pending || confirmation?.status === "PENDING_PAYMENT") return {
    title: "Confirming your payment", message: "Your payment was submitted. Check Orders for confirmation before trying to pay again.", confirmed: false
  };
  if (!confirmation) return {
    title: "Check your orders", message: "There’s no recent confirmation to show here. Your order history has the latest information.", confirmed: false
  };
  if (["CANCELED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(confirmation.status)) return {
    title: "Your order was updated", message: "Open Orders for the latest status and payment details.", confirmed: false
  };
  return { title: "Order confirmed", message: "We’ve received your order. Follow its progress in Orders.", confirmed: true };
}

export function failurePresentation(failure: CheckoutFailure | null) {
  if (!failure) return { title: "Return to your cart", message: "There’s no recent payment issue to show here." };
  if (failure.stage === "pay") return {
    title: "Payment didn’t finish", message: "Your cart is saved. Check Orders if you’re unsure whether payment completed before trying again."
  };
  return { title: "Unable to prepare checkout", message: "Review your cart and try again. Secure payment hasn’t opened yet." };
}
