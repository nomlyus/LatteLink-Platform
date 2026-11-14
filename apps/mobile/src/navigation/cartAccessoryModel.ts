export function supportsNativeCartAccessory(platform: string, version: string | number) {
  return platform === "ios" && Number.parseInt(String(version), 10) >= 26;
}

export function getCartNavigationState(itemCount: number, platform: string, version: string | number) {
  const hasCart = itemCount > 0;
  const nativeAccessorySupported = supportsNativeCartAccessory(platform, version);
  return {
    hasCart,
    showNativeAccessory: hasCart && nativeAccessorySupported,
    showFallbackAccessory: hasCart && !nativeAccessorySupported,
    minimizeBehavior: nativeAccessorySupported ? (hasCart ? "onScrollDown" : "never") : undefined
  } as const;
}

export function getCartAccessorySummary(itemCount: number, subtotalCents: number) {
  const countLabel = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  const subtotalLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    subtotalCents / 100
  );
  return { countLabel, subtotalLabel, accessibilityLabel: `Open cart, ${countLabel}, subtotal ${subtotalLabel}` };
}

export type CartAccessorySummary = ReturnType<typeof getCartAccessorySummary>;
