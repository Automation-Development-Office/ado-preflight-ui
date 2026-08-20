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
podman build --security-opt label=disable --network=host -t "${NAME}:latest" -f Containerfile .

free_port

podman run --rm -d \
  --name "${NAME}" \
  --security-opt label=disable \
  --add-host=host.containers.internal:host-gateway \
  -e AIRGAP_ARCHITECT_URL="${AIRGAP_ARCHITECT_URL:-http://host.containers.internal:8081}" \
  -p "${PORT}:8080" \
  "localhost/${NAME}:latest"

echo "Preflight UI: http://127.0.0.1:${PORT}"
echo "Airgap companion: ${AIRGAP_ARCHITECT_URL:-http://host.containers.internal:8081} (host :8081)"
echo "Hub EE: baked at /opt/ado-ee/ado-ee.docker.tar — Push EE uses skopeo inside the pod (AAP admin password from the form)."
