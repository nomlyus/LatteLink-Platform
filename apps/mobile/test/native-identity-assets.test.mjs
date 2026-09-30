import { Buffer } from "node:buffer";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { syncNativeIdentityAssets } from "../scripts/sync-native-identity-assets.mjs";

const releaseEnvironment = {
  APP_VARIANT: "beta",
  EAS_BUILD_PROFILE: "beta",
  EXPO_PUBLIC_BRAND_ID: "harbor-coffee",
  EXPO_PUBLIC_BRAND_NAME: "Harbor Coffee",
  APP_DISPLAY_NAME: "Harbor Coffee Beta",
  EXPO_PUBLIC_APP_DISPLAY_NAME: "Harbor Coffee Beta",
  EXPO_SLUG: "harbor-coffee",
  EXPO_SCHEME: "harborcoffee",
  IOS_BUNDLE_IDENTIFIER: "com.harborcoffee.mobile.beta",
  EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER: "com.harborcoffee.mobile.beta",
  EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID: "merchant.com.harborcoffee.mobile.beta",
  EAS_PROJECT_ID: "c9c4ea4f-84af-4e07-bb68-4b6cc9737427",
  EXPO_PUBLIC_APP_ICON_PATH: "./assets/brands/harbor/icon.png",
  EXPO_PUBLIC_APP_SPLASH_PATH: "./assets/brands/harbor/splash.png"
};

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function solidPng(width, height, color) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  for (let offset = 1; offset < row.length; offset += 4) {
    row.set(color, offset);
  }
  const pixels = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) {
    row.copy(pixels, y * row.length);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

async function createProject() {
  const mobileRoot = await mkdtemp(resolve(tmpdir(), "nomly-native-identity-"));
  const sourceDirectory = resolve(mobileRoot, "assets/brands/harbor");
  const icon = solidPng(1024, 1024, [20, 140, 220, 255]);
  const splash = solidPng(12, 16, [245, 242, 235, 255]);
  await mkdir(sourceDirectory, { recursive: true });
  await mkdir(resolve(mobileRoot, "ios/LatteLinkBeta/Images.xcassets/AppIcon.appiconset"), { recursive: true });
  await mkdir(resolve(mobileRoot, "ios/LatteLinkBeta/Images.xcassets/SplashScreenLegacy.imageset"), { recursive: true });
  await writeFile(resolve(sourceDirectory, "icon.png"), icon);
  await writeFile(resolve(sourceDirectory, "splash.png"), splash);
  return { mobileRoot, icon, splash };
}

describe("iOS native merchant identity assets", () => {
  it("copies explicit merchant icon and splash assets into the committed native project before compilation", async () => {
    const { mobileRoot, icon, splash } = await createProject();
    try {
      const result = await syncNativeIdentityAssets({ mobileRoot, env: releaseEnvironment });
      const assetRoot = resolve(mobileRoot, "ios/LatteLinkBeta/Images.xcassets");
      expect(result.skipped).toBe(false);
      expect(await readFile(resolve(assetRoot, "AppIcon.appiconset/App-Icon-1024x1024@1x.png"))).toEqual(icon);
      for (const name of ["image.png", "image@2x.png", "image@3x.png"]) {
        expect(await readFile(resolve(assetRoot, `SplashScreenLegacy.imageset/${name}`))).toEqual(splash);
      }
    } finally {
      await rm(mobileRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when release identity is incomplete or the app icon is not App Store sized", async () => {
    const { mobileRoot } = await createProject();
    try {
      await expect(syncNativeIdentityAssets({
        mobileRoot,
        env: { ...releaseEnvironment, EXPO_PUBLIC_BRAND_ID: "" }
      })).rejects.toThrow("Native release identity is incomplete");
      await expect(syncNativeIdentityAssets({
        mobileRoot,
        env: {
          ...releaseEnvironment,
          EXPO_PUBLIC_APP_ICON_PATH: "./assets/brands/harbor/splash.png"
        }
      })).rejects.toThrow("1024x1024 PNG");
      await expect(syncNativeIdentityAssets({
        mobileRoot,
        env: { ...releaseEnvironment, EXPO_PUBLIC_BRAND_NAME: "Rawaq Coffee" }
      })).rejects.toThrow("Rawaq/LatteLink identity or local assets");
    } finally {
      await rm(mobileRoot, { recursive: true, force: true });
    }
  });

  it("leaves local assets alone instead of applying merchant release configuration", async () => {
    const { mobileRoot } = await createProject();
    try {
      expect(await syncNativeIdentityAssets({ mobileRoot, env: { APP_VARIANT: "local" } })).toEqual({ skipped: true });
    } finally {
      await rm(mobileRoot, { recursive: true, force: true });
    }
  });
});
