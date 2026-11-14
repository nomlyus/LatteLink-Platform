import { useLocalSearchParams } from "expo-router";
import { OrderDetailScreen } from "../../src/orders/OrderDetailScreen";
import { AccountSheetSurface } from "../../src/account/AccountSheetSurface";

/** Compatibility links share the current receipt, including authoritative refund information. */
export default function OrderDetailRoute() {
  const { orderId } = useLocalSearchParams<{ orderId?: string | string[] }>();
  return <AccountSheetSurface><OrderDetailScreen orderId={Array.isArray(orderId) ? orderId[0] : orderId} headerOverlay={false} /></AccountSheetSurface>;
}
