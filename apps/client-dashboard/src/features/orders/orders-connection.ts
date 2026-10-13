import type { AdminOrderStreamState } from "../../api";

export type OrdersConnectionStatus = {
  online: boolean;
  selectedLocationId: string | null;
  connectionState: AdminOrderStreamState;
};

export function getOrdersConnectionLabel({ online, selectedLocationId, connectionState }: OrdersConnectionStatus) {
  if (!online) return "Offline — orders may be out of date";
  if (selectedLocationId === "all") return "Updating all locations every 30 seconds";
  if (connectionState === "connected") return "Live orders connected";
  if (connectionState === "connecting") return "Connecting to live orders";
  if (connectionState === "reconnecting") return "Live orders reconnecting — checking for updates";
  return "Live orders unavailable — checking for updates";
}
