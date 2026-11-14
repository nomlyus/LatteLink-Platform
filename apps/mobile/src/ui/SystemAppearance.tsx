import type { ReactNode } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { StatusBar, useColorScheme } from "react-native";
import { brandColors } from "./brandColors";

const lightTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: brandColors.forest } };
const darkTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: brandColors.forest } };

export function SystemAppearance({ children }: { children: ReactNode }) {
  const dark = useColorScheme() === "dark";
  return (
    <ThemeProvider value={dark ? darkTheme : lightTheme}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      {children}
    </ThemeProvider>
  );
}
