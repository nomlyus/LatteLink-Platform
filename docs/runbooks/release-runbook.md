# Release Runbook

1. Merge approved PR into `main`.
2. Confirm required checks are green (`lint`, `typecheck`, `unit-tests`, `contract-tests`, `build`, `terraform-validate`, security checks).
3. Verify `deploy-dev` workflow started successfully.
4. If `deploy-dev` skipped, confirm skip reason is expected (`AWS_ROLE_ARN` not configured) and continue only for local/free-stage releases.
5. Run smoke checks in `dev` when infrastructure credentials are configured.
6. Trigger `promote-staging` workflow.
7. Obtain staging approval and validate health/ready/metrics + key auth/order/payment flows.
8. Trigger `promote-prod` workflow.
9. Validate production health/ready/metrics endpoints and critical order lifecycle flows.
10. Confirm alarms and dashboards are healthy.
11. If failure occurs, execute rollback workflow.
