import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { MenuItemArtwork } from "../src/menu/MenuItemArtwork";
import type { MenuItem } from "../src/menu/catalog";

vi.stubGlobal("React", React);
vi.mock("react-native", () => ({ View: "View", Text: "Text", StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 } } }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "NativeGradient" }));
vi.mock("../src/menu/MenuCustomizeStates", () => ({ ProductImage: "ProductImage" }));
vi.mock("../src/menu/catalog", () => ({ formatUsd: (cents: number) => `$${(cents / 100).toFixed(2)}` }));

const item: MenuItem = { id: "latte", name: "Latte", description: "Espresso with milk", priceCents: 500, available: true, visible: true, featured: false, badgeCodes: [], customizationGroups: [] };

describe("image-led item details", () => {
  it("keeps details as a foreground sibling of full-width artwork", () => {
    const ready = vi.fn();
    const hero = MenuItemArtwork({ item, unitPriceCents: 650, onReady: ready });
    const [artwork, gradient, details] = hero.props.children;
    expect(hero.props.style).toMatchObject({ width: "100%", justifyContent: "flex-end" });
    expect(artwork.type).toBe("ProductImage");
    expect(artwork.props.style).toMatchObject({ position: "absolute", top: 0, bottom: 0 });
    expect(artwork.props.style.aspectRatio).toBeUndefined();
    expect(artwork.props.children).toBeUndefined();
    expect(gradient.type).toBe("NativeGradient");
    expect(gradient.props.pointerEvents).toBe("none");
    const [title, price] = details.props.children[0].props.children;
    expect(details.props.children[0].props.style).toMatchObject({ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" });
    expect(title.props.children).toBe("Latte");
    expect(price.props.children).toBe("$6.50");
    expect(title.props.style.textAlign).toBe("left");
    expect(price.props.style).toMatchObject({ textAlign: "right", flexShrink: 0 });
    expect(details.props.children[1].props.children).toBe(item.description);
    expect(title.props.style.color).toBe("#FFFFFF");
    artwork.props.onReady();
    expect(ready).toHaveBeenCalledOnce();
  });
  it("omits absent descriptions without hiding the product name or price", () => {
    const hero = MenuItemArtwork({ item: { ...item, description: "" }, unitPriceCents: 500, onReady: vi.fn() });
    expect(hero.props.children[2].props.children[1]).toBeNull();
  });
});
