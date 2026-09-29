import type { ExpoConfig } from "expo/config";
import { statSync } from "node:fs";
import { relative, resolve } from "node:path";
import nativeIdentityResolver from "./src/config/nativeIdentity.cjs";

const DEFAULT_PRIVACY_POLICY_URL = "https://nomly.us/privacy-policy";

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

function resolveAssociatedDomains() {
  return (process.env.IOS_ASSOCIATED_DOMAINS ?? "")
    .split(",")
    .map((entry: string) => entry.trim())
    .filter(Boolean);
}

const nativeIdentity = nativeIdentityResolver.resolveMobileNativeIdentity();
if (nativeIdentity.isRelease) {
  const mobileRoot = resolve(process.cwd());
  for (const [key, assetPath] of [
    ["EXPO_PUBLIC_APP_ICON_PATH", nativeIdentity.iconPath],
    ["EXPO_PUBLIC_APP_SPLASH_PATH", nativeIdentity.splashPath]
  ]) {
    const absolutePath = resolve(mobileRoot, assetPath);
    const relativePath = relative(mobileRoot, absolutePath);
    if (relativePath.startsWith("..") || relativePath === "" || !statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${key} must point to an existing file within the mobile project.`);
    }
  }
}
const applePayMerchantIdentifier = nativeIdentity.applePayMerchantIdentifier;
const applePayMerchantIdentifiers = applePayMerchantIdentifier ? [applePayMerchantIdentifier] : [];
const releaseApiBaseUrl = resolveReleaseApiBaseUrl();
const stripePlugin = [
  "@stripe/stripe-react-native",
  { merchantIdentifier: applePayMerchantIdentifiers }
] as [string, { merchantIdentifier: string[] }];
const sentryPlugin =
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? ([
        "@sentry/react-native/expo",
        {
          url: process.env.SENTRY_URL ?? "https://sentry.io/",
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT
        }
      ] as [string, { url: string; organization: string; project: string }])
    : null;

const config: ExpoConfig = {
  name: nativeIdentity.displayName,
  slug: nativeIdentity.slug,
  scheme: nativeIdentity.scheme,
  version: process.env.APP_VERSION ?? "1.2.0",
  orientation: "portrait",
  icon: nativeIdentity.iconPath,
  splash: {
    image: nativeIdentity.splashPath,
    resizeMode: "contain",
    backgroundColor: "#F7F4ED"
  },
  userInterfaceStyle: "light",
  updates: {
    ...(nativeIdentity.easProjectId ? { url: `https://u.expo.dev/${nativeIdentity.easProjectId}` } : {})
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: nativeIdentity.bundleIdentifier,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: "Allow $(PRODUCT_NAME) to access the camera to scan QR codes and capture profile images when those features are used.",
      NSUserNotificationUsageDescription: "$(PRODUCT_NAME) uses notifications to alert you when your order is ready for pickup."
    },
    associatedDomains: resolveAssociatedDomains(),
    entitlements: {
      "aps-environment": "production",
      ...(applePayMerchantIdentifiers.length > 0
        ? {
            "com.apple.developer.in-app-payments": applePayMerchantIdentifiers
          }
        : {})
    },
    runtimeVersion: process.env.APP_RUNTIME_VERSION ?? "1.2.0"
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
    appVariant: nativeIdentity.variant,
    easBuildProfile: process.env.EAS_BUILD_PROFILE ?? null,
    apiBaseUrl: releaseApiBaseUrl,
    brandId: nativeIdentity.brandId,
    applePayMerchantIdentifier,
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? DEFAULT_PRIVACY_POLICY_URL,
    ...(nativeIdentity.easProjectId ? { eas: { projectId: nativeIdentity.easProjectId } } : {})
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
    ],
    ...(sentryPlugin ? [sentryPlugin] : [])
  ]
};

export default config;
