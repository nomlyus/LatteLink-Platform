import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { tabDestinations } from "../src/navigation/destinations";
import { useCheckoutFlow } from "../src/orders/flow";
import { PaymentResultView } from "../src/orders/PaymentResultView";

export default function CheckoutSuccessScreen() {
  const router = useRouter();
  const { confirmation, paymentConfirmationPending, clearConfirmation } = useCheckoutFlow();
  const clearOnExit = useRef(clearConfirmation);
  clearOnExit.current = clearConfirmation;
  useEffect(() => () => clearOnExit.current(), []);
  return <PaymentResultView kind="confirmation" confirmation={confirmation} pending={paymentConfirmationPending}
    onPrimary={() => { clearConfirmation(); router.dismissTo(tabDestinations.orders); }}
    onSecondary={() => { clearConfirmation(); router.dismissTo(tabDestinations.menu); }} />;
}
