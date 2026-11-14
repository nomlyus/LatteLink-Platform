import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { NativeAppleSearchPreview } from "../src/search/NativeAppleSearchPreview";
import { nativeAppleSearchHeaderOptions } from "../src/search/nativeAppleSearchHeaderOptions";

const setQuery = vi.hoisted(() => vi.fn());
const focus = vi.hoisted(() => ({ nativeSearchRef: { current: null }, onSearchFocus: vi.fn(), onSearchBlur: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({ ...await original<typeof React>(), useState: () => ["", setQuery] }));
vi.mock("expo-router", () => ({ Stack: { Screen: "StackScreen" } }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => ({ nativeHeaderConfigurationVersion: 1, supportsNativeBarMinimization: true }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
vi.mock("../src/search/CatalogSearchResults", () => ({ CatalogSearchResults: "CatalogResults" }));
vi.mock("../src/search/useSearchFocus", () => ({ useSearchFocus: () => focus }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, Pressable: "Pressable", View: "View", StyleSheet: { create: (styles: unknown) => styles } }));

describe("native Search integration", () => {
  it("retains the single native header and input, with no second navigation stack", () => {
    const options = nativeAppleSearchHeaderOptions(vi.fn(), true);
    expect(options).toMatchObject({ headerShown: true, headerTransparent: true, headerShadowVisible: false,
      unstable_nativeProps: { headerConfig: { largeTitleDisplayMode: "inline", navigationBarMinimizationBehavior: "onScrollDown" } } });
    expect(options.headerSearchBarOptions).toMatchObject({ autoFocus: false, placeholder: "Search menu" });
    const screen = NativeAppleSearchPreview();
    expect(screen.props.children[1].type).toBe("CatalogResults");
    expect(screen.props.children[0].props.options.headerSearchBarOptions).toMatchObject({
      ref: focus.nativeSearchRef, onFocus: focus.onSearchFocus, onBlur: focus.onSearchBlur
    });
  });
  it("feeds native input and cancellation into the shared catalog results", () => {
    const screen = NativeAppleSearchPreview();
    const options = screen.props.children[0].props.options.headerSearchBarOptions;
    options.onChangeText({ nativeEvent: { text: "latte" } });
    expect(setQuery).toHaveBeenLastCalledWith("latte");
    options.onCancelButtonPress();
    expect(setQuery).toHaveBeenLastCalledWith("");
  });
});
