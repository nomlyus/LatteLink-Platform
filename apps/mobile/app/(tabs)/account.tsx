import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import {
  findActiveOrder,
  useLoyaltyBalanceQuery,
  useLoyaltyLedgerQuery,
  useOrderHistoryQuery,
  usePushTokenRegistrationMutation
} from "../../src/account/data";
import { formatUsd } from "../../src/menu/catalog";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString();
}

function formatOrderStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, session, signOut } = useAuthSession();
  const ordersQuery = useOrderHistoryQuery(isAuthenticated);
  const loyaltyBalanceQuery = useLoyaltyBalanceQuery(isAuthenticated);
  const loyaltyLedgerQuery = useLoyaltyLedgerQuery(isAuthenticated);
  const pushTokenMutation = usePushTokenRegistrationMutation();
  const [notificationStatus, setNotificationStatus] = useState("");
  const orders = ordersQuery.data ?? [];
  const activeOrder = findActiveOrder(orders);
  const loyaltyBalance = loyaltyBalanceQuery.data;
  const loyaltyLedger = loyaltyLedgerQuery.data ?? [];

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background px-6" style={{ paddingTop: insets.top + 20 }}>
        <Text className="text-[34px] font-semibold text-foreground">Account</Text>
        <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-5 py-5">
          <Text className="text-sm text-foreground/70">Sign in to access profile, order tracking, loyalty, and notification settings.</Text>
          <Link href={{ pathname: "/auth", params: { returnTo: "/(tabs)/account" } }} asChild>
            <Pressable
              className="mt-4 self-start rounded-full bg-foreground px-5 py-3"
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-background">Sign In</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  const isRefreshing =
    ordersQuery.isFetching ||
    loyaltyBalanceQuery.isFetching ||
    loyaltyLedgerQuery.isFetching ||
    pushTokenMutation.isPending;

  async function handleSignOut() {
    await signOut();
  }

  function handleRefresh() {
    void ordersQuery.refetch();
    void loyaltyBalanceQuery.refetch();
    void loyaltyLedgerQuery.refetch();
  }

  function handleRegisterPushToken() {
    const userIdFragment = session?.userId.slice(0, 8) ?? "guest";
    const tokenSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const deviceId = `mobile-${userIdFragment}`;
    const platform = "ios";
    const expoPushToken = `ExponentPushToken[${tokenSeed}]`;

    setNotificationStatus("Registering push token...");
    pushTokenMutation.mutate(
      { deviceId, platform, expoPushToken },
      {
        onSuccess: () => {
          setNotificationStatus("Push token registration updated.");
        },
        onError: (error) => {
          setNotificationStatus(toErrorMessage(error));
        }
      }
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 120 }}>
        <Text className="text-[34px] font-semibold text-foreground">Account</Text>
        <Text className="mt-2 text-sm text-foreground/70">Manage your order activity, rewards, and delivery settings.</Text>

        <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
          <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Profile</Text>
          <Text className="mt-2 text-sm text-foreground">User ID: {session?.userId ?? "Unknown"}</Text>
          <Text className="mt-1 text-xs text-foreground/70">Session expires: {formatDateTime(session?.expiresAt ?? "")}</Text>
        </View>

        <View className="mt-4 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Active Order</Text>
            <Pressable
              className={`rounded-full border px-3 py-2 ${isRefreshing ? "border-foreground/30" : "border-foreground/60"}`}
              disabled={isRefreshing}
              onPress={handleRefresh}
              accessibilityRole="button"
              accessibilityLabel="Refresh account data"
            >
              <Text className="text-[10px] font-semibold uppercase tracking-[1.5px] text-foreground/80">
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Text>
            </Pressable>
          </View>
          {ordersQuery.isLoading ? <Text className="mt-3 text-sm text-foreground/70">Loading active order...</Text> : null}
          {ordersQuery.error ? (
            <View className="mt-3">
              <Text className="text-sm text-foreground/70">{toErrorMessage(ordersQuery.error)}</Text>
              <Pressable
                className="mt-2 self-start rounded-full border border-foreground px-3 py-2"
                onPress={() => {
                  void ordersQuery.refetch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading active order"
              >
                <Text className="text-[10px] font-semibold uppercase tracking-[1.5px] text-foreground">Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {!ordersQuery.isLoading && !ordersQuery.error ? (
            activeOrder ? (
              <View className="mt-3 rounded-xl border border-foreground/10 bg-background px-3 py-3">
                <Text className="text-xs uppercase tracking-[1.2px] text-foreground/60">{formatOrderStatus(activeOrder.status)}</Text>
                <Text className="mt-1 text-sm font-semibold text-foreground">Pickup code: {activeOrder.pickupCode}</Text>
                <Text className="mt-1 text-xs text-foreground/70">
                  Updated: {formatDateTime(activeOrder.timeline[activeOrder.timeline.length - 1]?.occurredAt ?? "")}
                </Text>
              </View>
            ) : (
              <Text className="mt-3 text-sm text-foreground/70">No active order right now.</Text>
            )
          ) : null}
        </View>

        <View className="mt-4 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
          <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Order History</Text>
          {ordersQuery.isLoading ? <Text className="mt-3 text-sm text-foreground/70">Loading order history...</Text> : null}
          {ordersQuery.error ? (
            <Text className="mt-3 text-sm text-foreground/70">Unable to load order history.</Text>
          ) : null}
          {!ordersQuery.isLoading && !ordersQuery.error && orders.length === 0 ? (
            <Text className="mt-3 text-sm text-foreground/70">No completed orders yet.</Text>
          ) : null}
          {!ordersQuery.isLoading && !ordersQuery.error && orders.length > 0 ? (
            <View className="mt-3 gap-2">
              {orders.slice(0, 5).map((order) => (
                <View key={order.id} className="rounded-xl border border-foreground/10 bg-background px-3 py-3">
                  <Text className="text-xs uppercase tracking-[1.2px] text-foreground/60">{formatOrderStatus(order.status)}</Text>
                  <Text className="mt-1 text-sm font-semibold text-foreground">{order.pickupCode}</Text>
                  <Text className="mt-1 text-xs text-foreground/70">
                    {formatUsd(order.total.amountCents)} • {formatDateTime(order.timeline[order.timeline.length - 1]?.occurredAt ?? "")}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View className="mt-4 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
          <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Loyalty</Text>
          {loyaltyBalanceQuery.isLoading ? <Text className="mt-3 text-sm text-foreground/70">Loading loyalty balance...</Text> : null}
          {loyaltyBalanceQuery.error ? <Text className="mt-3 text-sm text-foreground/70">Unable to load loyalty balance.</Text> : null}
          {loyaltyBalance ? (
            <View className="mt-3 rounded-xl border border-foreground/10 bg-background px-3 py-3">
              <Text className="text-sm font-semibold text-foreground">{loyaltyBalance.availablePoints} points available</Text>
              <Text className="mt-1 text-xs text-foreground/70">
                Pending {loyaltyBalance.pendingPoints} • Lifetime earned {loyaltyBalance.lifetimeEarned}
              </Text>
            </View>
          ) : null}
          {loyaltyLedger.length > 0 ? (
            <View className="mt-3 gap-2">
              {loyaltyLedger.slice(0, 4).map((entry) => (
                <View key={entry.id} className="rounded-xl border border-foreground/10 bg-background px-3 py-3">
                  <Text className="text-xs uppercase tracking-[1.2px] text-foreground/60">
                    {entry.type} • {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </Text>
                  <Text className="mt-1 text-xs text-foreground/70">{formatDateTime(entry.createdAt)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View className="mt-4 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
          <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Notification Settings</Text>
          <Text className="mt-2 text-sm text-foreground/75">
            Register this device token to receive order status updates.
          </Text>
          <Pressable
            className={`mt-3 rounded-full border px-5 py-3 ${pushTokenMutation.isPending ? "border-foreground/30" : "border-foreground"}`}
            disabled={pushTokenMutation.isPending}
            onPress={handleRegisterPushToken}
            accessibilityRole="button"
            accessibilityLabel="Register push token for order updates"
          >
            <Text className="text-center text-xs font-semibold uppercase tracking-[1.8px] text-foreground">
              {pushTokenMutation.isPending ? "Saving..." : "Register Push Updates"}
            </Text>
          </Pressable>
          {notificationStatus ? <Text className="mt-2 text-xs text-foreground/70">{notificationStatus}</Text> : null}
        </View>

        <Pressable
          className="mt-5 rounded-full border border-foreground px-6 py-4"
          onPress={() => {
            void handleSignOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-foreground">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
