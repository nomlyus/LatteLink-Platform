export type DeploymentProvenance = {
  environment: "dev" | "production" | "local";
  buildCommit: string | null;
  releaseVersion: string | null;
};

export function resolveDeploymentProvenance(env: NodeJS.ProcessEnv): DeploymentProvenance {
  const environment = env.DEPLOY_ENV;
  const buildCommit = env.HEROKU_BUILD_COMMIT?.trim();
  const releaseVersion = env.HEROKU_RELEASE_VERSION?.trim();
  return {
    environment: environment === "dev" || environment === "production" ? environment : "local",
    // Heroku build metadata is optional. Do not infer a commit from a mutable
    // config var: changing one restarts the previous slug before the next push.
    buildCommit: buildCommit && /^[0-9a-f]{40}$/.test(buildCommit) ? buildCommit : null,
    releaseVersion: releaseVersion && /^v\d+$/.test(releaseVersion) ? releaseVersion : null,
  };
}
