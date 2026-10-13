import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL(
  "../.github/workflows/deploy-dev.yml",
  import.meta.url,
);
const checkoutScriptUrl = new URL("./dev-checkout-e2e.mjs", import.meta.url);

test("deploys reuse any current verified release and rebuild an already-present source SHA otherwise", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(
    workflow,
    /id: current_release\n\s+continue-on-error: true[\s\S]*verify-heroku-release-provenance\.mjs/,
  );
  assert.match(
    workflow,
    /id: deploy_source\n\s+if: steps\.current_release\.outcome == 'failure'[\s\S]*if \[ "\$\{remote_sha\}" = "\$\{DEPLOY_SHA\}" \]; then[\s\S]*source_ref_matches=true/,
  );
  assert.match(
    workflow,
    /if: steps\.current_release\.outcome == 'failure' && steps\.deploy_source\.outputs\.source_ref_matches == 'true'[\s\S]*deploy-heroku-source-build\.mjs/,
  );
});

test("release provenance is checked before API health and smoke checks", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const provenanceIndex = workflow.indexOf(
    "node scripts/wait-for-heroku-release-provenance.mjs",
  );
  const healthIndex = workflow.indexOf(
    "Wait for the dev API after release verification",
  );
  const smokeIndex = workflow.indexOf("Smoke check deployed stack");
  assert.ok(provenanceIndex >= 0);
  assert.ok(healthIndex > provenanceIndex);
  assert.ok(smokeIndex > healthIndex);
});

test("deployed checkout E2E receives both brand and location scope", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const checkoutE2E = workflow.slice(workflow.indexOf("- name: Run deployed checkout E2E"));
  assert.match(checkoutE2E, /DEV_E2E_BRAND_ID:.*CATALOG_DEFAULT_BRAND_ID/);
  assert.match(checkoutE2E, /DEV_E2E_LOCATION_ID:/);
});

test("dev checkout smoke validates unavailable public locations before creating a test customer", async () => {
  const script = await readFile(checkoutScriptUrl, "utf8");
  const bootstrapIndex = script.indexOf('requestApi(`/mobile/bootstrap?');
  const customerCreationIndex = script.indexOf('requestApi("/auth/dev-access"');
  assert.ok(bootstrapIndex >= 0);
  assert.ok(customerCreationIndex > bootstrapIndex);
  assert.match(script, /bootstrap\.status === "unavailable"/);
  assert.match(script, /PUBLIC_LOCATION_NOT_AVAILABLE/);
});
