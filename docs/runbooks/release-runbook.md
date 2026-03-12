# Release Runbook

1. Merge approved PR into `main`.
2. Confirm required checks are green (`lint`, `typecheck`, `unit-tests`, `contract-tests`, `build`, `terraform-validate`, `codeql`, `dependency-review`, `secret-scan`).
3. Verify `deploy-dev` workflow started successfully.
4. If `deploy-dev` skipped, confirm skip reason is expected (missing environment secrets/vars) and continue only for local/free-stage releases.
5. Select release image tag (default pattern: commit SHA).
6. Trigger `promote-staging` workflow with the selected `image_tag`.
7. Obtain staging approval and validate:
   - `/health`, `/ready`, `/metrics`, `/v1/meta/contracts`
   - auth, checkout, loyalty, and order-history flows
8. Run go/no-go checklist:
   - [`launch-readiness-checklist.md`](./launch-readiness-checklist.md)
9. Trigger `promote-prod` workflow with the same `image_tag`.
10. Validate production health + critical user flows.
11. If failure occurs, execute rollback workflow with previous known-good `image_tag`:
    - [`rollback-drill-database-integrity.md`](./rollback-drill-database-integrity.md)
12. For AWS migration planning and parity checks, use:
    - [`compose-to-ecs-mapping.md`](./compose-to-ecs-mapping.md)
