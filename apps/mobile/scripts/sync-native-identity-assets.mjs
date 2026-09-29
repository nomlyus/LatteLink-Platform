import { Buffer } from "node:buffer";
import { copyFile, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const RELEASE_VARIANTS = new Set(["beta", "production"]);

function releaseVariant(env) {
  const variant = env.EAS_BUILD_PROFILE?.trim() || env.APP_VARIANT?.trim() || "local";
  if (variant !== "local" && !RELEASE_VARIANTS.has(variant)) {
    throw new Error("Native identity asset sync requires APP_VARIANT local, beta, or production.");
  }
  if (env.EAS_BUILD_PROFILE?.trim() && env.APP_VARIANT?.trim() !== variant) {
    throw new Error("APP_VARIANT must match EAS_BUILD_PROFILE for native identity asset sync.");
  }
  return variant;
}

function validateReleaseInputs(env) {
  const required = [
    "EXPO_PUBLIC_BRAND_ID",
    "EXPO_PUBLIC_BRAND_NAME",
    "APP_DISPLAY_NAME",
    "EXPO_PUBLIC_APP_DISPLAY_NAME",
    "EXPO_SLUG",
    "EXPO_SCHEME",
    "IOS_BUNDLE_IDENTIFIER",
    "EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER",
    "EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID",
    "EAS_PROJECT_ID",
    "EXPO_PUBLIC_APP_ICON_PATH",
    "EXPO_PUBLIC_APP_SPLASH_PATH"
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Native release identity is incomplete. Missing: ${missing.join(", ")}.`);
  }
  if (env.APP_DISPLAY_NAME?.trim() !== env.EXPO_PUBLIC_APP_DISPLAY_NAME?.trim()) {
    throw new Error("Native display name must match APP_DISPLAY_NAME.");
  }
  if (env.IOS_BUNDLE_IDENTIFIER?.trim() !== env.EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER?.trim()) {
    throw new Error("Native bundle identifier must match IOS_BUNDLE_IDENTIFIER.");
  }
  if (
    env.EXPO_PUBLIC_BRAND_ID?.trim().toLowerCase() !== "rawaqcoffee" &&
    ([env.EXPO_PUBLIC_APP_ICON_PATH, env.EXPO_PUBLIC_APP_SPLASH_PATH]
      .some((path) => path?.trim().replace(/^\.\//, "") === "assets/icon.png" || path?.trim().replace(/^\.\//, "") === "assets/splash.png") ||
      [env.APP_DISPLAY_NAME, env.EXPO_PUBLIC_APP_DISPLAY_NAME, env.EXPO_PUBLIC_BRAND_NAME]
        .some((name) => /rawaq|lattelink/i.test(name ?? "")))
  ) {
    throw new Error("Rawaq/LatteLink identity or local assets cannot be used for a different brandId.");
  }
}

async function resolvePngPath(mobileRoot, assetPath, name) {
  const root = await realpath(mobileRoot);
  const path = await realpath(resolve(root, assetPath));
  const relativePath = relative(root, path);
  if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    throw new Error(`${name} must point to a file inside the mobile project.`);
  }
  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new Error(`${name} must point to an existing PNG file.`);
  }
  const contents = await readFile(path);
  if (contents.length < 24 || !contents.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${name} must point to a valid PNG image.`);
  }
  return { path, contents };
}

export async function syncNativeIdentityAssets({ mobileRoot, env = process.env }) {
  const variant = releaseVariant(env);
  if (!RELEASE_VARIANTS.has(variant)) {
    return { skipped: true };
  }

  validateReleaseInputs(env);
  const icon = await resolvePngPath(mobileRoot, env.EXPO_PUBLIC_APP_ICON_PATH.trim(), "EXPO_PUBLIC_APP_ICON_PATH");
  const splash = await resolvePngPath(mobileRoot, env.EXPO_PUBLIC_APP_SPLASH_PATH.trim(), "EXPO_PUBLIC_APP_SPLASH_PATH");
  const iconWidth = icon.contents.readUInt32BE(16);
  const iconHeight = icon.contents.readUInt32BE(20);
  if (iconWidth !== 1024 || iconHeight !== 1024) {
    throw new Error("EXPO_PUBLIC_APP_ICON_PATH must be a 1024x1024 PNG for the iOS App Store icon.");
  }

  const assetRoot = resolve(mobileRoot, "ios/LatteLinkBeta/Images.xcassets");
  const destinations = [
    [icon.path, resolve(assetRoot, "AppIcon.appiconset/App-Icon-1024x1024@1x.png")],
    [splash.path, resolve(assetRoot, "SplashScreenLegacy.imageset/image.png")],
    [splash.path, resolve(assetRoot, "SplashScreenLegacy.imageset/image@2x.png")],
    [splash.path, resolve(assetRoot, "SplashScreenLegacy.imageset/image@3x.png")]
  ];
  for (const [source, destination] of destinations) {
    await mkdir(dirname(destination), { recursive: true });
    if (source !== destination) {
      await copyFile(source, destination);
    }
  }

  return { skipped: false, iconPath: icon.path, splashPath: splash.path };
}

async function runCli() {
  const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await syncNativeIdentityAssets({ mobileRoot });
  if (result.skipped) {
    process.stdout.write("Local native asset sync skipped; release identity asset sync only runs for beta/production.\n");
    return;
  }
  process.stdout.write("iOS app icon and splash assets synchronized from explicit release configuration.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Native identity asset sync failed."}\n`);
    process.exitCode = 1;
  });
}
