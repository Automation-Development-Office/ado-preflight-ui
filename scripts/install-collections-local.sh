#!/usr/bin/env bash
# Install baked preflight collection tarballs into a local ansible collections path.
# Use for CLI bootstrap / Molecule against the same set the pod installs at bootstrap.
#
# Usage:
#   ./scripts/install-collections-local.sh
#   COLLECTION_DIR=./collections DEST=~/.ansible/collections ./scripts/install-collections-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

COLLECTION_DIR="${COLLECTION_DIR:-$(pwd)/collections}"
DEST="${DEST:-${HOME}/.ansible/collections}"
mkdir -p "$DEST"

install_latest() {
  local prefix="$1"
  local required="${2:-0}"
  local label="${3:-$prefix}"
  local archive=""
  archive="$(find "$COLLECTION_DIR" -maxdepth 1 -name "${prefix}-*.tar.gz" | sort -V | tail -n 1)"
  echo ""
  echo "=== ${label} ==="
  if [[ -z "$archive" ]]; then
    if [[ "$required" == "1" ]]; then
      echo "ERROR: No ${prefix}-*.tar.gz in ${COLLECTION_DIR}" >&2
      exit 1
    fi
    echo "skip (missing)"
    return 0
  fi
  echo "Installing ${archive} → ${DEST}"
  ansible-galaxy collection install "$archive" -p "$DEST" --force --no-deps
}

echo "COLLECTION_DIR=${COLLECTION_DIR}"
echo "DEST=${DEST}"
ls -l "$COLLECTION_DIR"/*.tar.gz 2>/dev/null | awk '{print $NF}' | xargs -n1 basename || true

install_latest infra-ado 1 "infra.ado"
install_latest ansible-controller 0 "ansible.controller"
install_latest awx-awx 0 "awx.awx"
install_latest infra-controller_configuration 0 "infra.controller_configuration"
install_latest infra-aap_configuration 0 "infra.aap_configuration"
install_latest infra-aap_utilities 0 "infra.aap_utilities"
install_latest ansible-platform 0 "ansible.platform"
install_latest ansible-hub 0 "ansible.hub"
install_latest ansible-eda 1 "ansible.eda"
install_latest kubernetes-core 0 "kubernetes.core"
install_latest redhat-openshift 0 "redhat.openshift"
install_latest community-kubernetes 0 "community.kubernetes"
install_latest community-crypto 1 "community.crypto"
install_latest community-general 0 "community.general"
install_latest community-grafana 0 "community.grafana"
install_latest ansible-posix 0 "ansible.posix"
install_latest ansible-utils 0 "ansible.utils"
install_latest amazon-aws 0 "amazon.aws"
install_latest freeipa-ansible_freeipa 0 "freeipa.ansible_freeipa"
install_latest infra-rhacs_configuration 0 "infra.rhacs_configuration"
install_latest community-hashi_vault 0 "community.hashi_vault"
install_latest containers-podman 0 "containers.podman"
install_latest redhat-satellite 0 "redhat.satellite"
install_latest redhat-rhel_idm 0 "redhat.rhel_idm"
install_latest redhat-rhel_system_roles 0 "redhat.rhel_system_roles"
install_latest grafana-grafana 0 "grafana.grafana"

echo ""
echo "Done. Example:"
echo "  export ANSIBLE_COLLECTIONS_PATH=\"${DEST}:\${ANSIBLE_COLLECTIONS_PATH:-/usr/share/ansible/collections}\""
ansible-galaxy collection list -p "$DEST" 2>/dev/null | head -80 || true
