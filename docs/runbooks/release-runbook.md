# Release Runbook

1. Merge approved PR into `main`.
2. Confirm all required checks are green.
3. Verify `deploy-dev` workflow completed.
4. Run smoke checks in `dev`.
5. Trigger `promote-staging` workflow.
6. Obtain staging approval and validate.
7. Trigger `promote-prod` workflow.
8. Validate prod health and metrics endpoints and key ordering flows.
9. Confirm CloudWatch alarms are healthy (CPU, memory, running task count).
10. If failure occurs, execute rollback workflow.
