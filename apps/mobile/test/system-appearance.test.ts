import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SystemAppearance } from "../src/ui/SystemAppearance";

const runtime = vi.hoisted(() => ({ scheme: "light" as "light" | "dark" | null }));
vi.stubGlobal("React", React);
vi.mock("expo-router", () => ({ ThemeProvider: "ThemeProvider", DarkTheme: { dark: true, colors: { text: "white" } }, DefaultTheme: { dark: false, colors: { text: "black" } } }));
vi.mock("react-native", () => ({ StatusBar: "StatusBar", useColorScheme: () => runtime.scheme }));

describe("system appearance", () => {
  it.each(["light", "dark", null] as const)("adapts navigation and status-bar text to %s", (scheme) => {
    runtime.scheme = scheme;
    const root = SystemAppearance({ children: "App content" });
    expect(root.props.value).toEqual({ dark: scheme === "dark", colors: { text: scheme === "dark" ? "white" : "black", primary: "#134733" } });
    expect(root.props.children[0].props.barStyle).toBe(scheme === "dark" ? "light-content" : "dark-content");
    expect(root.props.children[1]).toBe("App content");
  });
});
