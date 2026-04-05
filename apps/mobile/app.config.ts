import type { ExpoConfig } from "expo/config";

type AppVariant = "internal" | "beta" | "production";

function resolveAppVariant(): AppVariant {
  const rawVariant = process.env.APP_VARIANT;
  if (rawVariant === "internal" || rawVariant === "beta" || rawVariant === "production") {
    return rawVariant;
  }

  return "internal";
}

function resolveDisplayName(variant: AppVariant) {
  const baseName = process.env.APP_DISPLAY_NAME_BASE ?? "LatteLink";

  switch (variant) {
    case "production":
      return process.env.APP_DISPLAY_NAME ?? baseName;
    case "beta":
      return process.env.APP_DISPLAY_NAME ?? `${baseName} Beta`;
    case "internal":
    default:
      return process.env.APP_DISPLAY_NAME ?? `${baseName} Internal`;
  }
}

function resolveBundleIdentifier(variant: AppVariant) {
  if (process.env.IOS_BUNDLE_IDENTIFIER) {
    return process.env.IOS_BUNDLE_IDENTIFIER;
  }

  switch (variant) {
    case "production":
      return "com.lattelink.mobile";
    case "beta":
      return "com.lattelink.mobile.beta";
    case "internal":
    default:
      return "com.lattelink.mobile.internal";
  }
}

function resolveAssociatedDomains() {
  return (process.env.IOS_ASSOCIATED_DOMAINS ?? "")
    .split(",")
    .map((entry: string) => entry.trim())
    .filter(Boolean);
}

const variant = resolveAppVariant();
const config: ExpoConfig = {
  name: resolveDisplayName(variant),
  slug: process.env.EXPO_SLUG ?? "lattelink-mobile",
  scheme: process.env.EXPO_SCHEME ?? "lattelink",
  version: process.env.APP_VERSION ?? "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: resolveBundleIdentifier(variant),
    usesAppleSignIn: true,
    associatedDomains: resolveAssociatedDomains()
  },
  experiments: {
    typedRoutes: true
  },
  extra: {
    appVariant: variant,
    easBuildProfile: process.env.EAS_BUILD_PROFILE ?? null,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? null
  },
  plugins: ["expo-router", "expo-secure-store", "expo-font", "expo-apple-authentication"]
};

export default config;
