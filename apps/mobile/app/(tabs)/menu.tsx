import { useEffect, useMemo, useState } from "react";
import { Link } from "expo-router";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../../src/cart/store";
import {
  DEFAULT_CUSTOMIZATION,
  getCustomizationDeltaCents,
  getUnitPriceCents,
  type CartCustomization
} from "../../src/cart/model";
import {
  formatUsd,
  resolveMenuData,
  useMenuQuery,
  type MenuCategory,
  type MenuItem
} from "../../src/menu/catalog";

function CustomizationOption({
  label,
  selected,
  onPress,
  priceDeltaCents
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  priceDeltaCents?: number;
}) {
  return (
    <Pressable
      className={`rounded-full border px-4 py-2 ${selected ? "border-foreground bg-foreground" : "border-foreground/25 bg-white"}`}
      onPress={onPress}
    >
      <Text
        className={`text-xs font-semibold uppercase tracking-[1.5px] ${selected ? "text-background" : "text-foreground"}`}
      >
        {label}
        {priceDeltaCents && priceDeltaCents > 0 ? ` +${formatUsd(priceDeltaCents)}` : ""}
      </Text>
    </Pressable>
  );
}

function ItemCard({
  item,
  onCustomize
}: {
  item: MenuItem;
  onCustomize: (item: MenuItem) => void;
}) {
  return (
    <View className="rounded-2xl border border-foreground/15 bg-white px-4 py-4">
      <Text className="text-base font-semibold text-foreground">{item.name}</Text>
      <Text className="mt-1 text-sm leading-5 text-foreground/70">{item.description}</Text>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-foreground">{formatUsd(item.priceCents)}</Text>
        {item.badgeCodes.length > 0 ? (
          <View className="flex-row gap-1">
            {item.badgeCodes.map((badge) => (
              <View key={badge} className="rounded-full bg-foreground/10 px-2 py-1">
                <Text className="text-[10px] font-semibold uppercase tracking-[1px] text-foreground/80">
                  {badge}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Pressable className="mt-4 self-start rounded-full bg-foreground px-4 py-2" onPress={() => onCustomize(item)}>
        <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-background">Customize</Text>
      </Pressable>
    </View>
  );
}

function CategorySections({
  categories,
  onCustomize
}: {
  categories: MenuCategory[];
  onCustomize: (item: MenuItem) => void;
}) {
  return (
    <View className="mt-5 gap-6">
      {categories.map((category) => (
        <View key={category.id}>
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-foreground/60">{category.title}</Text>
          <View className="mt-2 gap-3">
            {category.items.map((item) => (
              <ItemCard key={item.id} item={item} onCustomize={onCustomize} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { addItem, itemCount, subtotalCents } = useCart();
  const menuQuery = useMenuQuery();
  const menu = resolveMenuData(menuQuery.data);
  const categories = menu.categories;

  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [customization, setCustomization] = useState<CartCustomization>(DEFAULT_CUSTOMIZATION);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (selectedCategoryId === "all") {
      return;
    }

    const exists = categories.some((category) => category.id === selectedCategoryId);
    if (!exists) {
      setSelectedCategoryId("all");
    }
  }, [categories, selectedCategoryId]);

  const searchLower = searchTerm.trim().toLowerCase();
  const visibleCategories = useMemo(() => {
    const withCategorySelection =
      selectedCategoryId === "all"
        ? categories
        : categories.filter((category) => category.id === selectedCategoryId);

    if (!searchLower) {
      return withCategorySelection;
    }

    return withCategorySelection
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          const haystack = `${item.name} ${item.description} ${item.badgeCodes.join(" ")}`.toLowerCase();
          return haystack.includes(searchLower);
        })
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, searchLower, selectedCategoryId]);

  const customizationDeltaCents = useMemo(() => getCustomizationDeltaCents(customization), [customization]);
  const selectedUnitPriceCents = activeItem
    ? getUnitPriceCents(activeItem.priceCents, customization)
    : 0;
  const selectedLineTotalCents = selectedUnitPriceCents * quantity;

  function openCustomization(item: MenuItem) {
    setActiveItem(item);
    setCustomization(DEFAULT_CUSTOMIZATION);
    setQuantity(1);
  }

  function closeCustomization() {
    setActiveItem(null);
  }

  function addSelectedItem() {
    if (!activeItem) {
      return;
    }

    addItem({
      menuItemId: activeItem.id,
      name: activeItem.name,
      basePriceCents: activeItem.priceCents,
      customization,
      quantity
    });
    closeCustomization();
  }

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
        <Text className="mt-2 text-sm text-foreground/70">
          Browse categories, customize items, and build your order.
        </Text>

        <TextInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCapitalize="none"
          placeholder="Search drinks and bites"
          className="mt-5 rounded-xl border border-foreground/20 bg-white px-4 py-3 text-foreground"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
          <View className="flex-row gap-2">
            <CustomizationOption
              label="All"
              selected={selectedCategoryId === "all"}
              onPress={() => setSelectedCategoryId("all")}
            />
            {categories.map((category) => (
              <CustomizationOption
                key={category.id}
                label={category.title}
                selected={selectedCategoryId === category.id}
                onPress={() => setSelectedCategoryId(category.id)}
              />
            ))}
          </View>
        </ScrollView>

        {menuQuery.isLoading ? (
          <Text className="mt-6 text-sm text-foreground/70">Loading menu...</Text>
        ) : null}

        {menuQuery.error ? (
          <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
            <Text className="text-sm text-foreground/70">
              Could not refresh live menu. Showing fallback catalog.
            </Text>
            <Pressable className="mt-3 self-start rounded-full border border-foreground px-4 py-2" onPress={() => void menuQuery.refetch()}>
              <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {visibleCategories.length === 0 ? (
          <View className="mt-6 rounded-2xl border border-foreground/15 bg-white px-4 py-4">
            <Text className="text-sm text-foreground/70">No items match your filters.</Text>
          </View>
        ) : (
          <CategorySections categories={visibleCategories} onCustomize={openCustomization} />
        )}
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

      <Modal visible={activeItem !== null} transparent animationType="slide" onRequestClose={closeCustomization}>
        <View className="flex-1 justify-end bg-black/35">
          <View
            className="rounded-t-3xl bg-background px-5 pb-8 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom + 20, 28), maxHeight: height * 0.84 }}
          >
            <View className="flex-row items-start justify-between">
              <View className="mr-3 flex-1">
                <Text className="text-xl font-semibold text-foreground">{activeItem?.name}</Text>
                <Text className="mt-1 text-sm text-foreground/70">{activeItem?.description}</Text>
              </View>
              <Pressable className="rounded-full border border-foreground/20 px-3 py-2" onPress={closeCustomization}>
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-foreground">Close</Text>
              </Pressable>
            </View>

            <Text className="mt-5 text-xs font-semibold uppercase tracking-[1.5px] text-foreground/70">Size</Text>
            <View className="mt-2 flex-row gap-2">
              <CustomizationOption
                label="Regular"
                selected={customization.size === "Regular"}
                onPress={() => setCustomization((prev) => ({ ...prev, size: "Regular" }))}
              />
              <CustomizationOption
                label="Large"
                selected={customization.size === "Large"}
                onPress={() => setCustomization((prev) => ({ ...prev, size: "Large" }))}
                priceDeltaCents={100}
              />
            </View>

            <Text className="mt-5 text-xs font-semibold uppercase tracking-[1.5px] text-foreground/70">Milk</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <CustomizationOption
                label="Whole"
                selected={customization.milk === "Whole"}
                onPress={() => setCustomization((prev) => ({ ...prev, milk: "Whole" }))}
              />
              <CustomizationOption
                label="Oat"
                selected={customization.milk === "Oat"}
                onPress={() => setCustomization((prev) => ({ ...prev, milk: "Oat" }))}
                priceDeltaCents={75}
              />
              <CustomizationOption
                label="Almond"
                selected={customization.milk === "Almond"}
                onPress={() => setCustomization((prev) => ({ ...prev, milk: "Almond" }))}
                priceDeltaCents={75}
              />
            </View>

            <Text className="mt-5 text-xs font-semibold uppercase tracking-[1.5px] text-foreground/70">Extras</Text>
            <View className="mt-2 flex-row gap-2">
              <CustomizationOption
                label="Extra Shot"
                selected={customization.extraShot}
                onPress={() => setCustomization((prev) => ({ ...prev, extraShot: !prev.extraShot }))}
                priceDeltaCents={125}
              />
            </View>

            <Text className="mt-5 text-xs font-semibold uppercase tracking-[1.5px] text-foreground/70">
              Notes
            </Text>
            <TextInput
              value={customization.notes ?? ""}
              onChangeText={(notes) => setCustomization((prev) => ({ ...prev, notes }))}
              placeholder="No foam, easy ice, etc."
              className="mt-2 rounded-xl border border-foreground/20 bg-white px-4 py-3 text-foreground"
              multiline
            />

            <View className="mt-5 flex-row items-center justify-between rounded-2xl border border-foreground/15 bg-white px-4 py-3">
              <Text className="text-sm font-semibold text-foreground">Quantity</Text>
              <View className="flex-row items-center gap-2">
                <Pressable
                  className="h-8 w-8 items-center justify-center rounded-full border border-foreground"
                  onPress={() => setQuantity((prev) => Math.max(1, prev - 1))}
                >
                  <Text className="text-base font-semibold text-foreground">-</Text>
                </Pressable>
                <Text className="w-8 text-center text-sm font-semibold text-foreground">{quantity}</Text>
                <Pressable
                  className="h-8 w-8 items-center justify-center rounded-full border border-foreground"
                  onPress={() => setQuantity((prev) => prev + 1)}
                >
                  <Text className="text-base font-semibold text-foreground">+</Text>
                </Pressable>
              </View>
            </View>

            <View className="mt-4 rounded-2xl border border-foreground/15 bg-white px-4 py-3">
              <Text className="text-xs uppercase tracking-[1.5px] text-foreground/60">Price</Text>
              <Text className="mt-1 text-sm text-foreground/75">
                Base {formatUsd(activeItem?.priceCents ?? 0)} + Customizations {formatUsd(customizationDeltaCents)}
              </Text>
              <Text className="mt-2 text-xl font-semibold text-foreground">{formatUsd(selectedLineTotalCents)}</Text>
            </View>

            <Pressable className="mt-5 rounded-full bg-foreground px-6 py-4" onPress={addSelectedItem}>
              <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-background">
                Add to Cart • {formatUsd(selectedLineTotalCents)}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
