# Release Runbook

The authoritative release and deployment workflow for this repo lives in [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md).

Current release flow:

1. Validate the candidate locally.
2. Push the candidate to `develop`.
3. Let `develop` publish images and auto-deploy to `dev`.
4. Verify the candidate in `dev`.
5. Merge or fast-forward the verified commit to `main`.
6. Promote the exact tested SHA to production with `deploy-prod`.
7. Verify the live environment.
8. Tag the release on `main` if you want a formal version marker.
9. Update [CHANGELOG.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/CHANGELOG.md) when needed.

Rollback uses the deployment workflow `workflow_dispatch` path with a previous full git SHA.

If this file ever conflicts with [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md), [development-flow.md](/Users/yazan/Documents/Gazelle/Dev/GazelleMobilePlatform/docs/runbooks/development-flow.md) wins.
