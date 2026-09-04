#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const herokuConfigKeys = [
  "NODE_ENV",
  "DEPLOY_ENV",
  "APP_VERSION",
  "LOG_LEVEL",
  "SENTRY_DSN",
  "SENTRY_TRACES_SAMPLE_RATE",
  "DATABASE_URL",
  "EXPECTED_SUPABASE_PROJECT_REF",
  "POSTGRES_CONNECTION_TIMEOUT_MS",
  "POSTGRES_IDLE_TIMEOUT_MS",
  "POSTGRES_POOL_BUDGET_LIMIT",
  "POSTGRES_POOL_HEADROOM_MIN",
  "IDENTITY_POSTGRES_POOL_MAX",
  "ORDERS_POSTGRES_POOL_MAX",
  "CATALOG_POSTGRES_POOL_MAX",
  "PAYMENTS_POSTGRES_POOL_MAX",
  "LOYALTY_POSTGRES_POOL_MAX",
  "NOTIFICATIONS_POSTGRES_POOL_MAX",
  "PAYMENT_RECONCILER_POSTGRES_POOL_MAX",
  "GATEWAY_INTERNAL_API_TOKEN",
  "ORDERS_INTERNAL_API_TOKEN",
  "LOYALTY_INTERNAL_API_TOKEN",
  "NOTIFICATIONS_INTERNAL_API_TOKEN",
  "JWT_SECRET",
  "ALLOW_DEV_CUSTOMER_LOGIN",
  "ALLOW_DEV_OPERATOR_LOGIN",
  "CUSTOMER_SESSION_ABSOLUTE_TTL_DAYS",
  "OPERATOR_SESSION_ABSOLUTE_TTL_DAYS",
  "INTERNAL_ADMIN_SESSION_ABSOLUTE_TTL_DAYS",
  "CLIENT_DASHBOARD_DOMAIN",
  "CLIENT_DASHBOARD_BASE_URL",
  "ADMIN_CONSOLE_CLIENT_DASHBOARD_URL",
  "CORS_ALLOWED_ORIGINS",
  "CORS_ALLOWED_ORIGIN_HOST_SUFFIXES",
  "PUBLIC_API_BASE_URL",
  "PASSKEY_RP_ID",
  "PASSKEY_RP_NAME",
  "PASSKEY_EXPECTED_ORIGINS",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "APPLE_ALLOWED_CLIENT_IDS",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_STATE_SECRET",
  "GOOGLE_OAUTH_ALLOWED_REDIRECT_URIS",
  "EMAIL_PROVIDER",
  "OWNER_INVITE_EMAIL_FROM",
  "RESEND_API_KEY",
  "PAYMENTS_PROVIDER_MODE",
  "CLOVER_OAUTH_ENVIRONMENT",
  "CLOVER_APP_ID",
  "CLOVER_APP_SECRET",
  "CLOVER_OAUTH_REDIRECT_URI",
  "CLOVER_OAUTH_STATE_SECRET",
  "CLOVER_WEBHOOK_SHARED_SECRET",
  "CLOVER_ORDER_TYPE_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "NOTIFICATIONS_PROVIDER_MODE",
  "EXPO_PUSH_API_URL",
  "EXPO_ACCESS_TOKEN",
  "ORDER_FULFILLMENT_MODE",
  "CATALOG_DEFAULT_LOCATION_ID",
  "CATALOG_DEFAULT_BRAND_ID",
  "CATALOG_DEFAULT_BRAND_NAME",
  "CATALOG_DEFAULT_LOCATION_NAME",
  "CATALOG_DEFAULT_MARKET_LABEL",
  "CATALOG_MEDIA_R2_ACCOUNT_ID",
  "CATALOG_MEDIA_R2_ACCESS_KEY_ID",
  "CATALOG_MEDIA_R2_SECRET_ACCESS_KEY",
  "CATALOG_MEDIA_R2_BUCKET",
  "CATALOG_MEDIA_PUBLIC_BASE_URL",
  "CATALOG_MEDIA_UPLOAD_MAX_BYTES",
  "CATALOG_MEDIA_UPLOAD_EXPIRY_SECONDS",
  "WEBAPP_MENU_SOURCE_URL",
  "MENU_SYNC_LOCATION_ID",
  "MENU_SYNC_INTERVAL_MS",
  "MENU_SYNC_MAX_RETRIES",
  "MENU_SYNC_RETRY_DELAY_MS",
  "MENU_SYNC_DEAD_LETTER_PATH",
  "NOTIFICATIONS_DISPATCH_INTERVAL_MS",
  "NOTIFICATIONS_DISPATCH_BATCH_SIZE",
  "PAYMENT_RECONCILER_ENABLED",
  "PAYMENT_RECONCILER_INTERVAL_MS",
  "PAYMENT_RECONCILER_STALE_THRESHOLD_MS",
  "PAYMENT_RECONCILER_BATCH_SIZE",
];

export function collectConfigVars(env, keys = herokuConfigKeys) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = env[key];
      return typeof value === "string" && value.length > 0
        ? [[key, value]]
        : [];
    }),
  );
}

export function changedConfigVars(current, desired) {
  return Object.fromEntries(
    Object.entries(desired).filter(([key, value]) => current[key] !== value),
  );
}

async function herokuRequest(path, input) {
  const apiKey = process.env.HEROKU_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("HEROKU_API_KEY is required");
  }

  const response = await fetch(`https://api.heroku.com${path}`, {
    ...input,
    headers: {
      accept: "application/vnd.heroku+json; version=3",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(input?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Heroku API ${input?.method ?? "GET"} ${path} failed (${response.status}): ${body}`,
    );
  }

  return response.json();
}

export async function syncHerokuConfig(env = process.env) {
  const appName = env.HEROKU_APP_NAME?.trim();
  if (!appName) {
    throw new Error("HEROKU_APP_NAME is required");
  }

  const appPath = `/apps/${encodeURIComponent(appName)}/config-vars`;
  const current = await herokuRequest(appPath);
  const desired = collectConfigVars(env);
  const changes = changedConfigVars(current, desired);
  const keys = Object.keys(changes).sort();

  if (keys.length === 0) {
    console.info(`[heroku-config] ${appName}: already current`);
    return { appName, updatedKeys: [] };
  }

  await herokuRequest(appPath, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
  console.info(`[heroku-config] ${appName}: updated ${keys.join(", ")}`);
  return { appName, updatedKeys: keys };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  await syncHerokuConfig();
}
