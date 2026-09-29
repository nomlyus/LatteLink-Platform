declare namespace nativeIdentityResolver {
  type MobileAppVariant = "local" | "beta" | "production";

  type MobileNativeIdentity = {
    variant: MobileAppVariant;
    displayName: string;
    slug: string;
    scheme: string;
    bundleIdentifier: string;
    publicBundleIdentifier: string;
    iconPath: string;
    splashPath: string;
    brandName: string | null;
    applePayMerchantIdentifier?: string;
    brandId: string | null;
    easProjectId?: string;
    isRelease: boolean;
  };

  function resolveMobileNativeIdentity(
    env?: Record<string, string | undefined>
  ): MobileNativeIdentity;
}

declare const nativeIdentityResolver: {
  resolveMobileNativeIdentity: typeof nativeIdentityResolver.resolveMobileNativeIdentity;
};

export = nativeIdentityResolver;
