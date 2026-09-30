/* global process, module */

const localIdentity = {
  displayName: "Nomly Local",
  slug: "nomly-local",
  scheme: "nomly-local",
  bundleIdentifier: "us.nomly.local",
  iconPath: "./assets/icon.png",
  splashPath: "./assets/splash.png"
};

function configuredValue(env, name) {
  const value = env[name]?.trim();
  return value || undefined;
}

function resolveVariant(env) {
  const easProfile = configuredValue(env, "EAS_BUILD_PROFILE");
  const appVariant = configuredValue(env, "APP_VARIANT");
  const knownVariants = new Set(["local", "beta", "production"]);

  if (easProfile && easProfile !== "beta" && easProfile !== "production") {
    throw new Error(`EAS_BUILD_PROFILE must be beta or production. Received: ${easProfile}`);
  }
  if (appVariant && !knownVariants.has(appVariant)) {
    throw new Error(`APP_VARIANT must be local, beta, or production. Received: ${appVariant}`);
  }
  if (easProfile && appVariant && easProfile !== appVariant) {
    throw new Error(`APP_VARIANT must match EAS_BUILD_PROFILE. Expected ${easProfile}, received ${appVariant}.`);
  }

  return easProfile || appVariant || "local";
}

function validateBrandBoundIdentity(brandId, identityValues) {
  const legacyRawaqIdentity = identityValues.some((value) => /rawaq|lattelink/i.test(value));
  if (legacyRawaqIdentity && brandId.toLowerCase() !== "rawaqcoffee") {
    throw new Error("Rawaq/LatteLink native identity values cannot be used for a different brandId.");
  }
}

function resolveMobileNativeIdentity(env = process.env) {
  const variant = resolveVariant(env);
  const isRelease = variant === "beta" || variant === "production";
  const displayName = configuredValue(env, "APP_DISPLAY_NAME") ||
    (isRelease ? undefined : configuredValue(env, "APP_DISPLAY_NAME_BASE") || localIdentity.displayName);
  const nativeDisplayName = configuredValue(env, "EXPO_PUBLIC_APP_DISPLAY_NAME");
  const slug = configuredValue(env, "EXPO_SLUG") || (isRelease ? undefined : localIdentity.slug);
  const scheme = configuredValue(env, "EXPO_SCHEME") || (isRelease ? undefined : localIdentity.scheme);
  const bundleIdentifier = configuredValue(env, "IOS_BUNDLE_IDENTIFIER") ||
    (isRelease ? undefined : localIdentity.bundleIdentifier);
  const iconPath = configuredValue(env, "EXPO_PUBLIC_APP_ICON_PATH") ||
    (isRelease ? undefined : localIdentity.iconPath);
  const splashPath = configuredValue(env, "EXPO_PUBLIC_APP_SPLASH_PATH") ||
    (isRelease ? undefined : localIdentity.splashPath);
  const publicBundleIdentifier = configuredValue(env, "EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER") ||
    (isRelease ? undefined : bundleIdentifier);
  const applePayMerchantIdentifier = configuredValue(env, "EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID");
  const brandId = configuredValue(env, "EXPO_PUBLIC_BRAND_ID") || null;
  const brandName = configuredValue(env, "EXPO_PUBLIC_BRAND_NAME") || null;
  const easProjectId = configuredValue(env, "EAS_PROJECT_ID");
  const missing = [
    ["EXPO_PUBLIC_BRAND_ID", brandId],
    ["EXPO_PUBLIC_BRAND_NAME", brandName],
    ["APP_DISPLAY_NAME", displayName],
    ["EXPO_PUBLIC_APP_DISPLAY_NAME", nativeDisplayName],
    ["EXPO_SLUG", slug],
    ["EXPO_SCHEME", scheme],
    ["IOS_BUNDLE_IDENTIFIER", bundleIdentifier],
    ["EXPO_PUBLIC_APP_ICON_PATH", iconPath],
    ["EXPO_PUBLIC_APP_SPLASH_PATH", splashPath],
    ["EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER", publicBundleIdentifier],
    ["EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID", applePayMerchantIdentifier],
    ["EAS_PROJECT_ID", easProjectId]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (isRelease && missing.length > 0) {
    throw new Error(`Release native identity is incomplete. Set explicit values for: ${missing.join(", ")}.`);
  }

  if (bundleIdentifier && publicBundleIdentifier && bundleIdentifier !== publicBundleIdentifier) {
    throw new Error("EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER must match IOS_BUNDLE_IDENTIFIER.");
  }
  if (isRelease && displayName && nativeDisplayName && displayName !== nativeDisplayName) {
    throw new Error("EXPO_PUBLIC_APP_DISPLAY_NAME must match APP_DISPLAY_NAME for the native iOS bundle.");
  }
  if (isRelease && slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    throw new Error("EXPO_SLUG must be a valid explicit merchant-app slug.");
  }
  if (isRelease && scheme && !/^[a-z][a-z0-9+.-]*$/i.test(scheme)) {
    throw new Error("EXPO_SCHEME must be a valid explicit app URL scheme.");
  }
  if (isRelease && bundleIdentifier && !/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(bundleIdentifier)) {
    throw new Error("IOS_BUNDLE_IDENTIFIER must be an explicit reverse-DNS identifier.");
  }
  if (isRelease && applePayMerchantIdentifier && !/^merchant\.[A-Za-z0-9.-]+$/.test(applePayMerchantIdentifier)) {
    throw new Error("EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID must be a valid Apple Pay merchant identifier.");
  }
  if (isRelease && easProjectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(easProjectId)) {
    throw new Error("EAS_PROJECT_ID must be a valid UUID for this merchant app's EAS/update identity.");
  }
  if (isRelease && brandId) {
    validateBrandBoundIdentity(brandId, [
      displayName || "",
      slug || "",
      scheme || "",
      bundleIdentifier || "",
      applePayMerchantIdentifier || "",
      brandName || ""
    ]);
    const localIcon = iconPath?.replace(/^\.\//, "");
    const localSplash = splashPath?.replace(/^\.\//, "");
    if (brandId.toLowerCase() !== "rawaqcoffee" && (localIcon === "assets/icon.png" || localSplash === "assets/splash.png")) {
      throw new Error("Rawaq local native assets cannot be used for a different brandId.");
    }
  }

  return {
    variant,
    displayName: displayName || localIdentity.displayName,
    slug: slug || localIdentity.slug,
    scheme: scheme || localIdentity.scheme,
    bundleIdentifier: bundleIdentifier || localIdentity.bundleIdentifier,
    publicBundleIdentifier: publicBundleIdentifier || bundleIdentifier || localIdentity.bundleIdentifier,
    iconPath: iconPath || localIdentity.iconPath,
    splashPath: splashPath || localIdentity.splashPath,
    brandName,
    applePayMerchantIdentifier,
    brandId,
    easProjectId,
    isRelease
  };
}

module.exports = { resolveMobileNativeIdentity };
