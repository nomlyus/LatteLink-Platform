import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Gazelle",
  slug: "gazelle-mobile",
  scheme: "gazelle",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.gazellecoffee.mobile",
    usesAppleSignIn: true,
    associatedDomains: ["webcredentials:api.gazellecoffee.com"]
  },
  experiments: {
    typedRoutes: true
  },
  plugins: ["expo-router", "expo-secure-store", "expo-font", "expo-apple-authentication"]
};

export default config;
