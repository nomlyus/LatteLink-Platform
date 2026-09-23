#!/usr/bin/env node

import { pathToFileURL } from "node:url";

function positiveInteger(env, name) {
  const value = Number(env[name]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function calculateDevHerokuPoolBudget(env) {
  if (env.DEPLOY_ENV !== "dev" || env.POSTGRES_SHARED_POOL_ENABLED !== "true") {
    throw new Error("This check requires the dev-only shared-pool configuration");
  }
  const reconcilerEnabled = env.PAYMENT_RECONCILER_ENABLED === "true";
  if (!reconcilerEnabled && env.PAYMENT_RECONCILER_ENABLED !== "false") {
    throw new Error("PAYMENT_RECONCILER_ENABLED must be true or false");
  }
  const general = positiveInteger(env, "POSTGRES_SHARED_GENERAL_POOL_MAX");
  const critical = positiveInteger(env, "POSTGRES_SHARED_CRITICAL_POOL_MAX");
  const reconciler = reconcilerEnabled
    ? positiveInteger(env, "POSTGRES_SHARED_RECONCILER_POOL_MAX")
    : 0;
  const budget = positiveInteger(env, "POSTGRES_POOL_BUDGET_LIMIT");
  const reserved = positiveInteger(env, "POSTGRES_POOL_HEADROOM_MIN");
  const maximum = general + critical + reconciler;
  if (maximum + reserved > budget) {
    throw new Error(`Application maximum ${maximum} plus reserve ${reserved} exceeds planning budget ${budget}`);
  }
  return { general, critical, reconciler, maximum, budget, reserved };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = calculateDevHerokuPoolBudget(process.env);
    console.info(`[heroku-pool-budget] app maximum=${result.maximum} (general=${result.general}, critical=${result.critical}, reconciler=${result.reconciler}); configured pooler limit=${result.budget}, reserve=${result.reserved}`);
    console.info("[heroku-pool-budget] Confirm this limit still matches dev Supavisor settings before raising it.");
  } catch (error) {
    console.error(`[heroku-pool-budget] ${error.message}`);
    process.exitCode = 1;
  }
}
