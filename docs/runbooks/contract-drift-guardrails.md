# Contract Drift Guardrails

Last reviewed: `2026-03-10`

## Purpose

Prevent drift between:
- published contracts (`packages/contracts/*`)
- gateway OpenAPI (`services/gateway/openapi/openapi.json`)
- mobile SDK generated types (`packages/sdk-mobile/src/generated/types.ts`)

## CI Enforcement

`ci / contract-tests` runs:

1. Contract package tests
2. `pnpm contracts:drift`

`contracts:drift` performs:

1. Gateway compatibility test against published contracts:
   - `services/gateway/test/contracts-compat.test.ts`
2. Gateway OpenAPI regeneration
3. SDK type regeneration from gateway OpenAPI
4. `git diff --exit-code` check on generated artifacts

If any step changes generated files or misses contract coverage, CI fails.

## Local Verification

```bash
pnpm contracts:drift
```

## Failure Triage

1. Run `pnpm contracts:drift` locally.
2. If compatibility test fails, update gateway routes or contract definitions.
3. If generated file drift appears, commit updated:
   - `services/gateway/openapi/openapi.json`
   - `packages/sdk-mobile/src/generated/types.ts`
4. Re-run the command and ensure no diff remains.
