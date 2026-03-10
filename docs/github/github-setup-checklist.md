# GitHub Setup Checklist

Last reviewed: `2026-03-09`

## Repository
- [x] org: `GazelleDev`
- [x] repo: `GazelleMobilePlatform`
- [x] visibility: `public`
- [x] default branch: `main`
- [x] merge method: squash only

## Teams
Create:
- [x] `@GazelleDev/mobile`
- [x] `@GazelleDev/platform`
- [x] `@GazelleDev/infra`
- [x] `@GazelleDev/security`

## Branch Protection (`main`)
Enable:
- [x] pull request required
- [ ] minimum 1 approval (currently `0`)
- [ ] CODEOWNERS review required (currently disabled)
- [x] dismiss stale approvals
- [x] require conversation resolution
- [x] require linear history
- [ ] require signed commits (currently disabled)
- [x] block force pushes
- [x] block deletion

Required checks:
- [x] `lint`
- [x] `typecheck`
- [x] `unit-tests`
- [x] `contract-tests`
- [x] `build`
- [x] `terraform-validate`
- [x] `codeql`
- [x] `dependency-review`
- [x] `secret-scan`

## Environments
Create environments:
- [x] `dev`
- [x] `staging`
- [x] `prod`

Rules:
- [x] `dev`: auto deploy from `main`
- [x] `staging`: manual approval
- [x] `prod`: manual approval with reviewers `@GazelleDev/platform`, `@GazelleDev/infra`

## Project Board
Create project board columns:
- [x] Backlog
- [x] Ready
- [x] In Progress
- [x] Review
- [x] Done

## Repository Variables
- [x] `AWS_REGION=us-east-1`
- [x] `API_BASE_URL_DEV`
- [x] `API_BASE_URL_STAGING`
- [x] `API_BASE_URL_PROD`

## Environment Secrets
- [ ] `AWS_ROLE_ARN`
- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `APPLE_TEAM_ID`
- [ ] `APPLE_KEY_ID`
- [ ] `APPLE_PRIVATE_KEY`
- [ ] `APPLE_SERVICE_ID`
- [ ] `APPLE_MERCHANT_ID`
- [ ] `CLOVER_API_KEY`
- [ ] `CLOVER_MERCHANT_ID`
- [ ] `SES_FROM_EMAIL`
- [ ] `EXPO_TOKEN`
- [ ] `JWT_PRIVATE_KEY`
- [ ] `JWT_PUBLIC_KEY`

Notes:
- `gh secret list --repo GazelleDev/GazelleMobilePlatform` and per-environment secret list commands returned no configured secrets on `2026-03-09`.
