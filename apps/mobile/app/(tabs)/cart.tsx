import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthSession } from "../../src/auth/session";
import { buildPricingSummary, describeCustomization } from "../../src/cart/model";
import { useCart } from "../../src/cart/store";
import { formatUsd, resolveStoreConfigData, useStoreConfigQuery } from "../../src/menu/catalog";

function SummaryRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className={`text-sm ${emphasized ? "font-semibold text-foreground" : "text-foreground/70"}`}>{label}</Text>
      <Text className={`text-sm ${emphasized ? "font-semibold text-foreground" : "text-foreground/70"}`}>{value}</Text>
    </View>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuthSession();
  const { items, itemCount, subtotalCents, setQuantity, removeItem, clear } = useCart();
  const storeConfigQuery = useStoreConfigQuery();
  const storeConfig = resolveStoreConfigData(storeConfigQuery.data);
  const pricingSummary = buildPricingSummary(subtotalCents, storeConfig.taxRateBasisPoints);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 18,
          paddingBottom: Math.max(insets.bottom + 148, 168)
        }}
      >
        <Text className="text-[34px] font-semibold text-foreground">Cart</Text>
        <Text className="mt-2 text-sm text-foreground/70">
          Review line items, adjust quantities, and confirm pricing before checkout.
        </Text>

        {items.length === 0 ? (
          <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-5 py-5">
            <Text className="text-sm text-foreground/70">Your cart is empty.</Text>
            <Link href="/(tabs)/menu" asChild>
              <Pressable className="mt-4 self-start rounded-full bg-foreground px-5 py-3">
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-background">
                  Browse Menu
                </Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View className="mt-6 gap-3">
            {items.map((item) => (
              <View key={item.lineId} className="rounded-2xl border border-foreground/15 bg-white px-4 py-4">
                <View className="flex-row items-start justify-between">
                  <Text className="mr-2 flex-1 text-base font-semibold text-foreground">{item.name}</Text>
                  <Text className="text-sm font-semibold text-foreground">
                    {formatUsd(item.unitPriceCents * item.quantity)}
                  </Text>
                </View>
                <Text className="mt-1 text-sm text-foreground/70">{describeCustomization(item.customization)}</Text>
                <Text className="mt-1 text-xs text-foreground/60">{formatUsd(item.unitPriceCents)} each</Text>

                <View className="mt-3 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      className="h-8 w-8 items-center justify-center rounded-full border border-foreground"
                      onPress={() => setQuantity(item.lineId, item.quantity - 1)}
                    >
                      <Text className="text-base font-semibold text-foreground">-</Text>
                    </Pressable>
                    <Text className="w-8 text-center text-sm font-semibold text-foreground">{item.quantity}</Text>
                    <Pressable
                      className="h-8 w-8 items-center justify-center rounded-full border border-foreground"
                      onPress={() => setQuantity(item.lineId, item.quantity + 1)}
                    >
                      <Text className="text-base font-semibold text-foreground">+</Text>
                    </Pressable>
                  </View>

                  <Pressable className="rounded-full border border-foreground/25 px-3 py-2" onPress={() => removeItem(item.lineId)}>
                    <Text className="text-xs font-semibold uppercase tracking-[1px] text-foreground/70">Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <View className="mt-1 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
              <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Pricing Summary</Text>
              <View className="mt-3 gap-2">
                <SummaryRow label={`Items (${itemCount})`} value={formatUsd(pricingSummary.subtotalCents)} />
                <SummaryRow
                  label={`Estimated tax (${(storeConfig.taxRateBasisPoints / 100).toFixed(2)}%)`}
                  value={formatUsd(pricingSummary.taxCents)}
                />
                <View className="my-1 h-px bg-foreground/10" />
                <SummaryRow label="Estimated total" value={formatUsd(pricingSummary.totalCents)} emphasized />
              </View>
            </View>

            <View className="rounded-2xl border border-foreground/15 bg-white px-4 py-4">
              <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Pickup</Text>
              <Text className="mt-2 text-sm text-foreground/75">{storeConfig.pickupInstructions}</Text>
              <Text className="mt-1 text-xs text-foreground/60">Estimated prep time: {storeConfig.prepEtaMinutes} min</Text>
            </View>

            {isAuthenticated ? (
              <Pressable className="mt-1 rounded-full bg-foreground/50 px-5 py-4" disabled>
                <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
                  Checkout (Coming Soon)
                </Text>
              </Pressable>
            ) : (
              <Link href={{ pathname: "/auth", params: { returnTo: "/(tabs)/cart" } }} asChild>
                <Pressable className="mt-1 rounded-full bg-foreground px-5 py-4">
                  <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
                    Sign In to Checkout
                  </Text>
                </Pressable>
              </Link>
            )}

            <Pressable className="rounded-full border border-foreground px-5 py-3" onPress={clear}>
              <Text className="text-center text-xs font-semibold uppercase tracking-[1.5px] text-foreground">
                Clear Cart
              </Text>
            </Pressable>

            {storeConfigQuery.error ? (
              <Text className="text-xs text-foreground/60">
                Using fallback store settings while live config is unavailable.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
