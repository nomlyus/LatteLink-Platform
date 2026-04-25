import type { ExpoConfig } from "expo/config";

type AppVariant = "internal" | "beta" | "production";
const DEFAULT_APP_VARIANT: AppVariant = "beta";
const DEFAULT_BETA_APPLE_PAY_MERCHANT_IDENTIFIER = "merchant.com.lattelink.mobile.beta";
const DEFAULT_PRIVACY_POLICY_URL = "https://nomly.us/privacy-policy";

function resolveAppVariant(): AppVariant {
  const rawVariant = process.env.APP_VARIANT;
  if (rawVariant === "internal" || rawVariant === "beta" || rawVariant === "production") {
    return rawVariant;
  }
  return DEFAULT_APP_VARIANT;
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

function resolveReleaseApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (value.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL must be a valid URL. Received: ${value}`);
  }

  return parsed.toString().replace(/\/+$/, "");
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

function resolveApplePayMerchantIdentifier(variant: AppVariant, bundleIdentifier: string) {
  const merchantIdentifier = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID?.trim();
  if (merchantIdentifier) {
    return merchantIdentifier;
  }

  if (variant === "beta" && bundleIdentifier === "com.lattelink.mobile.beta") {
    return DEFAULT_BETA_APPLE_PAY_MERCHANT_IDENTIFIER;
  }

  return undefined;
}

const variant = resolveAppVariant();
const bundleIdentifier = resolveBundleIdentifier(variant);
const applePayMerchantIdentifier = resolveApplePayMerchantIdentifier(variant, bundleIdentifier);
const applePayMerchantIdentifiers = applePayMerchantIdentifier ? [applePayMerchantIdentifier] : [];
const releaseApiBaseUrl = resolveReleaseApiBaseUrl();
const stripePlugin = [
  "@stripe/stripe-react-native",
  { merchantIdentifier: applePayMerchantIdentifiers }
] as [string, { merchantIdentifier: string[] }];

const config: ExpoConfig = {
  name: resolveDisplayName(variant),
  slug: process.env.EXPO_SLUG ?? "lattelink-mobile",
  scheme: process.env.EXPO_SCHEME ?? "lattelink",
  version: process.env.APP_VERSION ?? "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  userInterfaceStyle: "light",
  updates: {
    url: "https://u.expo.dev/18320a67-0f15-4860-9f84-845eb0f4c31c"
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: "Allow $(PRODUCT_NAME) to access the camera to scan QR codes and capture profile images when those features are used.",
      NSUserNotificationUsageDescription: "$(PRODUCT_NAME) uses notifications to alert you when your order is ready for pickup."
    },
    associatedDomains: resolveAssociatedDomains(),
    entitlements:
      applePayMerchantIdentifiers.length > 0
        ? {
            "com.apple.developer.in-app-payments": applePayMerchantIdentifiers
          }
        : undefined,
    runtimeVersion: "1.0.0"
  },
  android: {
    runtimeVersion: {
      policy: "appVersion"
    }
  },
  experiments: {
    typedRoutes: true
  },
  extra: {
    appVariant: variant,
    easBuildProfile: process.env.EAS_BUILD_PROFILE ?? null,
    apiBaseUrl: releaseApiBaseUrl,
    applePayMerchantIdentifier,
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? DEFAULT_PRIVACY_POLICY_URL,
    eas: {
      projectId: "18320a67-0f15-4860-9f84-845eb0f4c31c"
    }
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-apple-authentication",
    stripePlugin,
    [
      "expo-notifications",
      {
        iosDisplayInForeground: true
      }
    ]
  ]
};

export default config;
