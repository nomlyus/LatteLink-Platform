import assert from "node:assert/strict";
import test from "node:test";
import {
  changedConfigVars,
  collectConfigVars,
  herokuConfigKeys,
} from "./heroku-sync-config.mjs";

test("the Heroku config allowlist excludes platform-owned and deploy credentials", () => {
  assert.equal(herokuConfigKeys.includes("PORT"), false);
  assert.equal(herokuConfigKeys.includes("HEROKU_API_KEY"), false);
  assert.equal(herokuConfigKeys.includes("HEROKU_APP_NAME"), false);
});

test("collectConfigVars keeps multiline secrets and omits empty values", () => {
  assert.deepEqual(
    collectConfigVars(
      {
        APP_VERSION: "1.0.10",
        APPLE_PRIVATE_KEY: "line-one\nline-two",
        STRIPE_SECRET_KEY: "",
      },
      ["APP_VERSION", "APPLE_PRIVATE_KEY", "STRIPE_SECRET_KEY"],
    ),
    {
      APP_VERSION: "1.0.10",
      APPLE_PRIVATE_KEY: "line-one\nline-two",
    },
  );
});

test("changedConfigVars only sends values that differ", () => {
  assert.deepEqual(
    changedConfigVars(
      { APP_VERSION: "1.0.9", LOG_LEVEL: "info" },
      { APP_VERSION: "1.0.10", LOG_LEVEL: "info" },
    ),
    { APP_VERSION: "1.0.10" },
  );
});
