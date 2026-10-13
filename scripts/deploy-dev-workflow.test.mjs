import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL(
  "../.github/workflows/deploy-dev.yml",
  import.meta.url,
);

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
