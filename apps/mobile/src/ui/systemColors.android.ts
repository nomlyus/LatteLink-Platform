import { PlatformColor } from "react-native";
import { createSystemPalette } from "./createSystemPalette";

export const uiPalette = createSystemPalette((_ios, android) => PlatformColor(android));
