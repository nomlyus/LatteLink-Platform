import { useLocalSearchParams } from "expo-router";
import { OrderDetailScreen } from "../../../src/orders/OrderDetailScreen";

export default function OrdersSheetDetailRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <OrderDetailScreen orderId={orderId} />;
}
