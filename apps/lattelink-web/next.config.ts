import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(appDir, "../.."),
  reactStrictMode: true
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? "nomly",
  project: process.env.SENTRY_PROJECT ?? "lattelink-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true
  }
});
