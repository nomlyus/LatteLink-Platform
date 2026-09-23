import { describe, expect, it } from "vitest";
import { resolveDeploymentProvenance } from "../src/provenance.js";

describe("deployment provenance", () => {
  it("keeps absent Heroku metadata explicitly unknown", () => {
    expect(resolveDeploymentProvenance({ DEPLOY_ENV: "dev" } as NodeJS.ProcessEnv)).toEqual({
      environment: "dev",
      buildCommit: null,
      releaseVersion: null,
    });
  });

  it("accepts only non-sensitive, well-formed metadata", () => {
    const sha = "a".repeat(40);
    expect(resolveDeploymentProvenance({
      DEPLOY_ENV: "production",
      HEROKU_BUILD_COMMIT: sha,
      HEROKU_RELEASE_VERSION: "v42",
    } as NodeJS.ProcessEnv)).toEqual({
      environment: "production",
      buildCommit: sha,
      releaseVersion: "v42",
    });
    expect(resolveDeploymentProvenance({
      DEPLOY_ENV: "dev\nsecret",
      HEROKU_BUILD_COMMIT: "not-a-sha",
      HEROKU_RELEASE_VERSION: "v42\nsecret",
    } as NodeJS.ProcessEnv)).toEqual({
      environment: "local",
      buildCommit: null,
      releaseVersion: null,
    });
  });
});
