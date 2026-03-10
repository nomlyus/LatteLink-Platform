# Contributing

## Branching

- Default branch: `main`
- Use short-lived feature branches
- Merge strategy: squash merge

## Pull Requests

PRs must include:

- linked issue
- test evidence
- risk and rollback notes
- security impact
- migration notes

## Required Checks

- `ci / lint`
- `ci / typecheck`
- `ci / unit-tests`
- `ci / contract-tests`
- `ci / build`
- `ci / terraform-validate`
- `security / codeql`
- `security / dependency-review`
- `security / secret-scan`

## Contract Drift Guardrail

Run this before opening PRs that touch contracts, gateway routes, or SDK generation:

- `pnpm contracts:drift`
