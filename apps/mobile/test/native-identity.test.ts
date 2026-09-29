import { describe, expect, it } from "vitest";
import nativeIdentityResolver from "../src/config/nativeIdentity.cjs";

const { resolveMobileNativeIdentity } = nativeIdentityResolver;

const releaseIdentity = {
  EAS_BUILD_PROFILE: "beta",
  APP_VARIANT: "beta",
  EXPO_PUBLIC_BRAND_ID: "harbor-coffee",
  EXPO_PUBLIC_BRAND_NAME: "Harbor Coffee",
  APP_DISPLAY_NAME: "Harbor Coffee Beta",
  EXPO_PUBLIC_APP_DISPLAY_NAME: "Harbor Coffee Beta",
  EXPO_PUBLIC_APP_ICON_PATH: "./test/fixtures/brand-b-icon.png",
  EXPO_PUBLIC_APP_SPLASH_PATH: "./test/fixtures/brand-b-splash.png",
  EXPO_SLUG: "harbor-coffee",
  EXPO_SCHEME: "harborcoffee",
  IOS_BUNDLE_IDENTIFIER: "com.harborcoffee.mobile.beta",
  EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: "com.harborcoffee.mobile.beta",
  EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: "merchant.com.harborcoffee.mobile.beta",
  EAS_PROJECT_ID: "c9c4ea4f-84af-4e07-bb68-4b6cc9737427"
};

describe("mobile native release identity", () => {
  it("resolves an explicitly configured second-brand identity", () => {
    expect(resolveMobileNativeIdentity(releaseIdentity)).toMatchObject({
      variant: "beta",
      displayName: "Harbor Coffee Beta",
      slug: "harbor-coffee",
      scheme: "harborcoffee",
      bundleIdentifier: "com.harborcoffee.mobile.beta",
      applePayMerchantIdentifier: "merchant.com.harborcoffee.mobile.beta",
      iconPath: "./test/fixtures/brand-b-icon.png",
      splashPath: "./test/fixtures/brand-b-splash.png",
      brandId: "harbor-coffee",
      easProjectId: "c9c4ea4f-84af-4e07-bb68-4b6cc9737427"
    });
  });

  it("rejects a legacy customer-facing brand label reused by another brand", () => {
    expect(() => resolveMobileNativeIdentity({
      ...releaseIdentity,
      EXPO_PUBLIC_BRAND_NAME: "Rawaq Coffee"
    })).toThrow(/cannot be used for a different brandId/);
  });

  it("fails closed when release identity inputs are missing and has no merchant fallback", () => {
    expect(() => resolveMobileNativeIdentity({
      EAS_BUILD_PROFILE: "production",
      APP_VARIANT: "production"
    })).toThrow(/EXPO_PUBLIC_BRAND_ID.*APP_DISPLAY_NAME.*EXPO_SLUG.*EXPO_SCHEME.*IOS_BUNDLE_IDENTIFIER/);
  });

  it("rejects Rawaq/LatteLink identity reused for a different brand", () => {
    expect(() => resolveMobileNativeIdentity({
      ...releaseIdentity,
      APP_DISPLAY_NAME: "Rawaq Beta",
      EXPO_PUBLIC_APP_DISPLAY_NAME: "Rawaq Beta",
      EXPO_PUBLIC_APP_ICON_PATH: "./assets/icon.png",
      EXPO_PUBLIC_APP_SPLASH_PATH: "./assets/splash.png",
      EXPO_SLUG: "rawaqcoffee",
      EXPO_SCHEME: "rawaq",
      IOS_BUNDLE_IDENTIFIER: "com.lattelink.rawaq.beta",
      EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: "com.lattelink.rawaq.beta",
      EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: "merchant.com.lattelink.rawaq.beta"
    })).toThrow(/cannot be used for a different brandId/);
  });

  it("uses only generic local identity when a developer has not configured a release", () => {
    expect(resolveMobileNativeIdentity({})).toMatchObject({
      variant: "local",
      displayName: "Nomly Local",
      slug: "nomly-local",
      scheme: "nomly-local",
      bundleIdentifier: "us.nomly.local",
      brandId: null,
      isRelease: false
    });
  });
});
