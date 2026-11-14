import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { getRoutes } from "expo-router/build/getRoutes";
import { getReactNavigationConfig, type Screen } from "expo-router/build/getReactNavigationConfig";
import type { RequireContext } from "expo-router/build/types";
import type { getStateFromPath } from "expo-router/build/fork/getStateFromPath";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { resolveReturnToPath } from "../src/auth/presentation";
import { tabDestinations } from "../src/navigation/destinations";
import HomeCompatibilityRoute from "../app/(tabs)/home";
import MenuCompatibilityRoute from "../app/(tabs)/menu";

vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({
  Redirect: "Redirect",
  useLocalSearchParams: () => ({ categoryId: "coffee", source: "deep-link" })
}));

const appRoot = new URL("../app/", import.meta.url);
const keys = readdirSync(appRoot, { recursive: true, encoding: "utf8" })
  .filter((key) => key.endsWith(".tsx"))
  .map((key) => `./${key}`);
// Exercise Expo's actual route discovery/configuration without loading native screen modules in Node.
const context: RequireContext = Object.assign(() => ({ default: () => null }), {
  keys: () => keys,
  resolve: (key: string) => key,
  id: "test-app"
});
const config = getReactNavigationConfig(getRoutes(context, { platform: "ios", ignoreEntryPoints: true }), false);
const linkingConfig = getReactNavigationConfig(getRoutes(context, { platform: "ios", ignoreEntryPoints: true }), true);

// Run the installed path parser and real validator without importing RN's Flow entrypoint into Node.
const require = createRequire(import.meta.url);
const parserPath = require.resolve("expo-router/build/fork/getStateFromPath");
const parserRequire = createRequire(parserPath);
const parser: { getStateFromPath?: typeof getStateFromPath } = {};
runInNewContext(
  readFileSync(parserPath, "utf8"),
  {
    exports: parser,
    process,
    console,
    require: (specifier: string) =>
      parserRequire(
        specifier === "../react-navigation/native" ? "../react-navigation/core/validatePathConfig" : specifier
      )
  },
  { filename: parserPath }
);

function screen(value: Screen | undefined) {
  if (!value || typeof value === "string") throw new Error("Expected nested route configuration");
  return value;
}

describe("native navigation route compatibility", () => {
  it.each([
    ["/home", "index"],
    ["/menu?categoryId=coffee", "index"],
    ["/orders", "index"],
    ["/(tabs)/orders/month?month=2026-10", "month"],
    ["/(tabs)/orders/detail?orderId=test-order", "detail"],
    ["/search", "index"],
    ["/account", "index"],
    ["/account/settings", "account/settings"],
    ["/(tabs)/home", "index"],
    ["/(tabs)/orders", "index"],
    ["/rewards", "index"],
    ["/(tabs)/(navigation)/rewards", "index"],
    ["/(tabs)/account", "index"],
    ["/(tabs)/(navigation)/menu", "index"],
    ["/orders/test-order", "orders/[orderId]"],
    ["/menu-customize?itemId=test-item", "menu-customize"]
  ])("resolves actual deep-link path %s with Expo's installed parser", (path, expected) => {
    if (!parser.getStateFromPath) throw new Error("Path parser did not load");
    let state = parser.getStateFromPath(path, linkingConfig);
    const names: string[] = [];
    while (state?.routes.length) {
      const route = state.routes[state.index ?? state.routes.length - 1];
      names.push(route.name);
      state = route.state;
    }
    expect(names.at(-1)).toBe(expected);
  });
  it("discovers exactly four native destinations, with Account in the parent stack", () => {
    const parent = screen(config.screens["(tabs)"]);
    const native = screen(parent.screens["(navigation)"]);
    expect(Object.keys(native.screens).sort()).toEqual(["home", "menu", "rewards", "search"]);
    expect(parent.screens).toHaveProperty("account");
    expect(native.screens).not.toHaveProperty("account");
    expect(screen(native.screens.search).screens).toHaveProperty("index");
    expect(screen(native.screens.home).screens).toHaveProperty("index");
    expect(screen(native.screens.menu).screens).toHaveProperty("index");
    expect(screen(native.screens.rewards).screens).toHaveProperty("index");
    expect(screen(parent.screens.orders).screens).toHaveProperty("index");
    expect(native.screens).not.toHaveProperty("orders");
  });

  it.each(["rewards", "profile", "settings"])("keeps %s navigation under the Account sheet", (page) => {
    if (!parser.getStateFromPath) throw new Error("Path parser did not load");
    const state = parser.getStateFromPath(`/(tabs)/account/details/${page}`, linkingConfig);
    const tabs = state?.routes.find((route) => route.name === "(tabs)");
    const account = tabs?.state?.routes.find((route) => route.name === "account");
    expect(account?.state?.routes.at(-1)?.name).toBe(`details/${page}`);
  });

  it.each(["home", "menu"])(
    "retains existing /%s and group-qualified links through a thin redirect",
    (name) => {
      const parent = screen(config.screens["(tabs)"]);
      expect(screen(parent.screens[name]).path).toBe(name);
      const source = readFileSync(new URL(`(tabs)/${name}.tsx`, appRoot), "utf8");
      expect(source).toContain(`pathname: tabDestinations.${name}`);
      expect(source).not.toContain("Screen()");
    }
  );

  it("keeps account auth returns, nested account links, cart, and customization routes", () => {
    expect(resolveReturnToPath("/(tabs)/account")).toBe("/(tabs)/account");
    for (const path of [
      "account/settings",
      "account/alerts",
      "account/rewards",
      "account/session",
      "cart",
      "auth",
      "checkout",
      "menu-customize",
      "orders/[orderId]"
    ]) {
      expect(config.screens).toHaveProperty(path);
    }
    const home = readFileSync(new URL("(tabs)/(navigation)/home/_layout.tsx", appRoot), "utf8");
    const search = readFileSync(new URL("(tabs)/(navigation)/search/_layout.tsx", appRoot), "utf8");
    expect(home).toContain('accountHeaderOptions(() => router.push("/(tabs)/account"))');
    expect(search).toContain('nativeAppleSearchHeaderOptions(() => router.push("/(tabs)/account")');
    expect(home).toContain("headerTransparent: true");
  });

  it.each([
    [HomeCompatibilityRoute, tabDestinations.home],
    [MenuCompatibilityRoute, tabDestinations.menu]
  ] as const)("preserves query parameters through compatibility entry %s", (route, pathname) => {
    expect(route().props.href).toEqual({ pathname, params: { categoryId: "coffee", source: "deep-link" } });
  });

  it("keeps native Home as the initial destination without a cart-dependent navigator key", () => {
    const source = readFileSync(new URL("(tabs)/(navigation)/_layout.tsx", appRoot), "utf8");
    expect(source).toContain('initialRouteName: "home"');
    expect(source).toContain("<BottomTabNavigator />");
  });

  it("keeps order history outside native tabs and points the enabled Home action there", () => {
    const home = readFileSync(new URL("(tabs)/(navigation)/home/_layout.tsx", appRoot), "utf8");
    expect(home).toContain("homeHeaderOptions(() => router.push(tabDestinations.orders))");
    expect(tabDestinations.orders).toBe("/(tabs)/orders");
    if (!parser.getStateFromPath) throw new Error("Path parser did not load");
    const state = parser.getStateFromPath("/orders?source=home", linkingConfig);
    const parent = state?.routes.find((route) => route.name === "(tabs)");
    expect(parent?.state?.routes.at(-1)?.name).toBe("orders");
  });
});
