import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuthSession } from "../../src/auth/session";
import { useCart } from "../../src/cart/store";

function formatUsd(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export default function CartScreen() {
  const { isAuthenticated } = useAuthSession();
  const { items, subtotalCents, setQuantity, clear } = useCart();

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-background px-6 pt-20">
        <Text className="text-[34px] font-semibold text-foreground">Cart</Text>
        <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-5 py-5">
          <Text className="text-sm text-foreground/70">
            Sign in to access your cart across devices and continue checkout.
          </Text>
          <Link href={{ pathname: "/auth", params: { returnTo: "/(tabs)/cart" } }} asChild>
            <Pressable className="mt-4 self-start rounded-full bg-foreground px-5 py-3">
              <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-background">Sign In</Text>
            </Pressable>
          </Link>
          <Link href="/(tabs)/menu" asChild>
            <Pressable className="mt-3 self-start rounded-full border border-foreground px-5 py-3">
              <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-foreground">
                Browse Menu
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background px-6 pt-20">
      <Text className="text-[34px] font-semibold text-foreground">Cart</Text>

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
            <View key={item.id} className="rounded-2xl border border-foreground/15 bg-white px-4 py-4">
              <Text className="text-base font-semibold text-foreground">{item.name}</Text>
              <Text className="mt-1 text-sm text-foreground/60">
                {formatUsd(item.priceCents)} x {item.quantity}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  className="rounded-full border border-foreground px-3 py-2"
                  onPress={() => setQuantity(item.id, item.quantity - 1)}
                >
                  <Text className="text-xs font-semibold text-foreground">-</Text>
                </Pressable>
                <Pressable
                  className="rounded-full border border-foreground px-3 py-2"
                  onPress={() => setQuantity(item.id, item.quantity + 1)}
                >
                  <Text className="text-xs font-semibold text-foreground">+</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <View className="mt-2 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
            <Text className="text-sm text-foreground/70">Subtotal</Text>
            <Text className="mt-1 text-xl font-semibold text-foreground">{formatUsd(subtotalCents)}</Text>
          </View>

          <Pressable className="mt-1 rounded-full border border-foreground px-5 py-3" onPress={clear}>
            <Text className="text-center text-xs font-semibold uppercase tracking-[1.5px] text-foreground">
              Clear Cart
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
