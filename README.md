# GazelleMobilePlatform

Public monorepo for Gazelle's mobile ordering platform.

## Scope

- Expo iOS app (`apps/mobile`)
- API gateway and microservices (`services/*`)
- Shared contracts, design tokens, SDKs (`packages/*`)
- AWS Terraform (`infra/terraform`)
- Delivery/governance docs (`docs/*`)

## Architecture

See [architecture-overview.md](docs/architecture/architecture-overview.md).

## Quickstart

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Workspace Scripts

- `pnpm dev`
- `pnpm dev:services`
- `pnpm dev:services:lan`
- `pnpm dev:mobile:local`
- `pnpm dev:mobile:lan`
- `pnpm dev:worker:menu-sync`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm verify`
- `pnpm contracts:openapi`
- `pnpm contracts:drift`
- `pnpm sdk:generate`

## Local E2E App + API Testing

Use the local stack runbook:
- [local-dev-stack.md](docs/runbooks/local-dev-stack.md)

## Governance and GitHub Setup

Manual GitHub UI tasks are documented in [github-setup-checklist.md](docs/github/github-setup-checklist.md).

## Security

- No secrets in repository history.
- Runtime secrets in GitHub Environments + AWS Secrets Manager.
- See [SECURITY.md](SECURITY.md).
