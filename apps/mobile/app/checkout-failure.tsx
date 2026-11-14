import { useRouter } from "expo-router";
import { tabDestinations } from "../src/navigation/destinations";
import { useCheckoutFlow } from "../src/orders/flow";
import { PaymentResultView } from "../src/orders/PaymentResultView";

export default function CheckoutFailureScreen() {
  const router = useRouter();
  const { failure, clearFailure } = useCheckoutFlow();
  return <PaymentResultView kind="failure" failure={failure}
    onPrimary={() => { clearFailure(); router.dismissTo("/cart"); }}
    onSecondary={() => { clearFailure(); router.dismissTo(tabDestinations.orders); }} />;
}
