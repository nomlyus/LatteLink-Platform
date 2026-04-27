#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${1:-deploy}"
DEPLOY_PATH="${2:-/opt/lattelink}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root on a fresh Ubuntu host."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
fi
chmod a+r /etc/apt/keyrings/docker.asc

cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
fi

usermod -aG docker "${DEPLOY_USER}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${DEPLOY_PATH}"

cat <<EOF
Bootstrap complete.

Next:
1. Add your GitHub Actions deploy public key to ~${DEPLOY_USER}/.ssh/authorized_keys
2. Verify docker access with: su - ${DEPLOY_USER} -c 'docker version'
3. Point your API DNS record to this host
4. Configure the matching GitHub Environment vars/secrets, then run publish-images followed by deploy-dev or deploy-prod

Deploy path: ${DEPLOY_PATH}
Deploy user: ${DEPLOY_USER}
EOF
