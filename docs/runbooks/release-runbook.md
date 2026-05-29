# Release Runbook

The authoritative release and deployment workflow for this repo lives in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md).

Current release flow:

1. Validate the candidate locally.
2. Push the candidate to `develop`.
3. Let `develop` publish images and auto-deploy to `dev`.
4. Verify the candidate in `dev`.
5. Merge or fast-forward the verified commit to `main`.
6. Promote the exact tested SHA to production with `deploy-prod`, passing the next semantic release tag.
7. Verify the live environment.
8. Let `deploy-prod` create the release tag after the production smoke check passes.
9. Update [CHANGELOG.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/CHANGELOG.md) when needed.

Rollback uses the deployment workflow `workflow_dispatch` path with a previous full git SHA.

New production releases must use `release_kind=release` and a new `release_tag` such as `v1.0.5`. The workflow rejects tags that do not advance beyond the latest `vX.Y.Z` tag. Rollbacks use `release_kind=rollback` and do not create a new tag.

If this file ever conflicts with [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md), [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md) wins.
