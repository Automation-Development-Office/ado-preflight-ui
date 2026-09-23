#!/usr/bin/env bash
# Rebuild local preflight UI with baked-in ADO EE (skopeo push from inside the pod).
# No host podman socket. No runtime internet for EE push — only Hub on the lab network.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
NAME="${NAME:-ado-preflight-ui}"

free_port() {
  # Prior container (common cause of "port already allocated")
  podman rm -f "${NAME}" 2>/dev/null || true
  # Any other container publishing host ${PORT}
  local ids
  ids="$(podman ps -aq --filter "publish=${PORT}" 2>/dev/null || true)"
  if [[ -n "${ids}" ]]; then
    # shellcheck disable=SC2086
    podman rm -f ${ids} 2>/dev/null || true
  fi
  # Orphan rootless pasta/slirp still holding the host port after a bad stop
  if command -v ss >/dev/null 2>&1; then
    local pids
    pids="$(ss -tlnp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p"$" {print}' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
    for pid in ${pids}; do
      local cmd
      cmd="$(ps -o comm= -p "${pid}" 2>/dev/null || true)"
      if [[ "${cmd}" == pasta || "${cmd}" == pasta.avx2 || "${cmd}" == slirp4netns ]]; then
        kill "${pid}" 2>/dev/null || true
      fi
    done
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  fi
  sleep 1
}

bash ./scripts/prepare-ado-ee-archive.sh

free_port

# Fedora SELinux: rootless podman needs label=disable or RUN fails with
# "cannot apply additional memory protection after relocation"
ADO_COLLECTIONS_SHA="$(
  find collections -maxdepth 1 -type f \( -name 'infra-ado-*.tar.gz' -o -name 'ado-*.tar.gz' \) \
    -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}'
)"
if [[ -z "${ADO_COLLECTIONS_SHA}" ]]; then
  ADO_COLLECTIONS_SHA="missing-$(date +%s)"
fi
ADO_UI_SHA="$(
  find src -type f \( -name '*.jsx' -o -name '*.js' -o -name '*.css' -o -name '*.tsx' -o -name '*.ts' \) \
    -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}'
)"
if [[ -z "${ADO_UI_SHA}" ]]; then
  ADO_UI_SHA="missing-$(date +%s)"
fi
echo "ADO_COLLECTIONS_SHA=${ADO_COLLECTIONS_SHA}"
echo "ADO_UI_SHA=${ADO_UI_SHA}"
podman build --security-opt label=disable --network=host \
  --build-arg "ADO_COLLECTIONS_SHA=${ADO_COLLECTIONS_SHA}" \
  --build-arg "ADO_UI_SHA=${ADO_UI_SHA}" \
  -t "${NAME}:latest" -f Containerfile .

free_port

PODMAN_MOUNT=()
if [[ -n "${XDG_RUNTIME_DIR:-}" && -S "${XDG_RUNTIME_DIR}/podman/podman.sock" ]]; then
  PODMAN_MOUNT=(-v "${XDG_RUNTIME_DIR}/podman/podman.sock:${XDG_RUNTIME_DIR}/podman/podman.sock")
fi

KUBE_MOUNT=()
if [[ -f "${HOME}/.kube/config" ]]; then
  KUBE_MOUNT=(-v "${HOME}/.kube/config:/tmp/kube/config:ro" -e "KUBECONFIG=/tmp/kube/config")
fi

podman run --rm -d \
  --name "${NAME}" \
  --security-opt label=disable \
  --add-host=host.containers.internal:host-gateway \
  -e AIRGAP_ARCHITECT_URL="${AIRGAP_ARCHITECT_URL:-http://host.containers.internal:8081}" \
  -e ADO_PREFLIGHT_DEPLOY_OPENSHIFT_ENABLED="${ADO_PREFLIGHT_DEPLOY_OPENSHIFT_ENABLED:-true}" \
  "${PODMAN_MOUNT[@]}" \
  "${KUBE_MOUNT[@]}" \
  -p "${PORT}:8080" \
  "localhost/${NAME}:latest"

echo "Preflight UI: http://127.0.0.1:${PORT}"
echo "Airgap companion: ${AIRGAP_ARCHITECT_URL:-http://host.containers.internal:8081} (host :8081)"
echo "Hub EE: baked at /opt/ado-ee/ado-ee.docker.tar — Push EE uses skopeo inside the pod (AAP admin password from the form)."
