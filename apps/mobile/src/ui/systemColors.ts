import { createSystemPalette } from "./createSystemPalette";

/** Neutral fallback for web and non-native environments; native bundles use platform files. */
export const uiPalette = createSystemPalette((_ios, _android, fallback) => fallback);
