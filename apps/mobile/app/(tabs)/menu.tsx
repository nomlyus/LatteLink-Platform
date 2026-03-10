import { Pressable, ScrollView, Text, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../../src/cart/store";

const demoMenu = [
  { id: "latte", name: "Honey Oat Latte", priceCents: 675 },
  { id: "cold-brew", name: "Single-Origin Cold Brew", priceCents: 550 },
  { id: "croissant", name: "Butter Croissant", priceCents: 425 },
  { id: "matcha", name: "Ceremonial Matcha", priceCents: 725 }
];

function formatUsd(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { addItem, itemCount, subtotalCents } = useCart();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 18,
          paddingBottom: Math.max(insets.bottom + 222, 248)
        }}
      >
        <Text className="text-[34px] font-semibold text-foreground">Menu</Text>
        <Text className="mt-2 text-sm text-foreground/70">Freshly brewed picks for quick pickup.</Text>

        <View className="mt-6 gap-3">
          {demoMenu.map((item) => (
            <View key={item.id} className="rounded-2xl border border-foreground/15 bg-white px-4 py-4">
              <Text className="text-base font-semibold text-foreground">{item.name}</Text>
              <Text className="mt-1 text-sm text-foreground/60">{formatUsd(item.priceCents)}</Text>
              <Pressable
                className="mt-3 self-start rounded-full bg-foreground px-4 py-2"
                onPress={() => addItem({ id: item.id, name: item.name, priceCents: item.priceCents })}
              >
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-background">
                  Add
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>

      {itemCount > 0 ? (
        <View
          className="absolute inset-x-0 items-center"
          style={{ bottom: Math.max(insets.bottom + 96, 110) }}
          pointerEvents="box-none"
        >
          <Link href="/(tabs)/cart" asChild>
            <Pressable
              className="rounded-full bg-foreground px-6 py-3"
              style={{
                shadowColor: "#242327",
                shadowOpacity: 0.2,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8
              }}
            >
              <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
                View Cart ({itemCount}) • {formatUsd(subtotalCents)}
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </View>
  );
}
