import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchScene } from "../src/search/SearchScene";

const update = vi.hoisted(() => vi.fn());
const input = vi.hoisted(() => ({ current: null }));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({ ...await original<typeof React>(), useState: () => ["coffee", update] }));
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" } }));
vi.mock("../src/search/useSearchFocus", () => ({ useSearchFocus: () => ({ webSearchRef: input }) }));
vi.mock("../src/search/CatalogSearchResults", () => ({ CatalogSearchResults: "CatalogResults" }));
vi.mock("react-native", () => ({ TextInput: "TextInput", View: "View", StyleSheet: { create: (styles: unknown) => styles } }));

describe("Search fallback", () => {
  it("uses a native text input and the same results on clients without the Apple header bridge", () => {
    const scene = SearchScene();
    expect(scene.props.children[0].props.options).toMatchObject({ title: "Search", headerShown: true });
    const [field, results] = scene.props.children[1].props.children;
    expect(field.type).toBe("TextInput");
    expect(field.props.ref).toBe(input);
    expect(field.props.autoCapitalize).toBe("none");
    field.props.onChangeText("espresso");
    expect(update).toHaveBeenCalledWith("espresso");
    expect(results).toMatchObject({ type: "CatalogResults", props: { query: "coffee" } });
  });
});
