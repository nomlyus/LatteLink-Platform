#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[contracts:drift] verifying gateway OpenAPI coverage against published contracts"
pnpm exec turbo run build --filter=@lattelink/gateway
pnpm --filter @lattelink/gateway test -- test/contracts-compat.test.ts

echo "[contracts:drift] regenerating gateway OpenAPI and SDK types"
pnpm exec turbo run openapi --filter=@lattelink/gateway
pnpm --filter @lattelink/sdk-mobile generate

echo "[contracts:drift] checking for generated artifact drift"
git diff --exit-code -- services/gateway/openapi/openapi.json packages/sdk-mobile/src/generated/types.ts

echo "[contracts:drift] no drift detected"
