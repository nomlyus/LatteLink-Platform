import assert from "node:assert/strict";
import test from "node:test";
import { calculateDevHerokuPoolBudget } from "./check-heroku-pool-budget.mjs";

const base = {
  DEPLOY_ENV: "dev",
  POSTGRES_SHARED_POOL_ENABLED: "true",
  POSTGRES_SHARED_GENERAL_POOL_MAX: "4",
  POSTGRES_SHARED_CRITICAL_POOL_MAX: "4",
  POSTGRES_SHARED_RECONCILER_POOL_MAX: "1",
  PAYMENT_RECONCILER_ENABLED: "true",
  POSTGRES_POOL_BUDGET_LIMIT: "15",
  POSTGRES_POOL_HEADROOM_MIN: "6"
};

test("counts the two shared pools and enabled reconciler", () => {
  assert.equal(calculateDevHerokuPoolBudget(base).maximum, 9);
});

test("excludes a disabled reconciler", () => {
  assert.equal(calculateDevHerokuPoolBudget({ ...base, PAYMENT_RECONCILER_ENABLED: "false" }).maximum, 8);
});

test("blocks over-budget changes", () => {
  assert.throws(
    () => calculateDevHerokuPoolBudget({ ...base, POSTGRES_SHARED_CRITICAL_POOL_MAX: "5" }),
    /exceeds planning budget/
  );
});

test("cannot accidentally validate production", () => {
  assert.throws(
    () => calculateDevHerokuPoolBudget({ ...base, DEPLOY_ENV: "production" }),
    /dev-only/
  );
});
