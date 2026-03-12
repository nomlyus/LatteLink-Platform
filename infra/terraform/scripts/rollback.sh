#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:?environment required}"
IMAGE_TAG="${2:?image tag required}"
ENV_DIR="infra/terraform/envs/${ENVIRONMENT}"

if [[ ! -d "${ENV_DIR}" ]]; then
  echo "[rollback] unknown environment '${ENVIRONMENT}' (expected dev|staging|prod)"
  exit 1
fi

echo "[rollback] applying ${ENVIRONMENT} with image tag ${IMAGE_TAG}"
terraform -chdir="${ENV_DIR}" init
terraform -chdir="${ENV_DIR}" apply -auto-approve -var "image_tag=${IMAGE_TAG}"

echo "[rollback] running post-rollback smoke check"
"$(dirname "$0")/smoke-check.sh" "${ENVIRONMENT}"

echo "[rollback] completed for ${ENVIRONMENT} with image tag ${IMAGE_TAG}"
