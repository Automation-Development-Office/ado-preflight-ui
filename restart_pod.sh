#!/usr/bin/env bash
# Rebuild local preflight UI with baked-in ADO EE (skopeo push from inside the pod).
# No host podman socket. No runtime internet for EE push — only Hub on the lab network.
set -euo pipefail

PORT="${PORT:-8080}"
NAME="${NAME:-ado-preflight-ui}"

# Host publish address. Empty publishes on every interface (localhost and the
# machine's other addresses), which is the historical -p PORT:8080 behavior.
# Set BIND_ADDR=127.0.0.1 to publish on localhost only.
# Inside the container the server still listens on 8080.
BIND_ADDR="${BIND_ADDR:-}"

listeners_on_port() {
  local port="$1"
  if ! command -v ss >/dev/null 2>&1; then
    echo "ss is required to check whether port ${port} is free" >&2
    return 2
  fi
  ss -tlnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" {print}'
}

stop_named_container() {
  if podman container exists "${NAME}" >/dev/null 2>&1; then
    podman rm -f "${NAME}"
  fi
}

assert_port_free() {
  local port="$1"
  local lines
  lines="$(listeners_on_port "${port}")" || return $?
  if [[ -n "${lines}" ]]; then
    echo "Port ${port} is already in use. The ${NAME} container was not started." >&2
    echo "Another process owns this port. Preflight will not stop it." >&2
    echo "${lines}" >&2
    return 1
  fi
}

# Empty BIND_ADDR publishes on all host interfaces. A set value publishes on that address only.
publish_spec() {
  if [[ -n "${BIND_ADDR}" ]]; then
    printf '%s\n' "${BIND_ADDR}:${PORT}:8080"
  else
    printf '%s\n' "${PORT}:8080"
  fi
}

# 127.0.0.1 reaches an all-interfaces publish. A specific bind address is probed there.
probe_url() {
  local host="127.0.0.1"
  if [[ -n "${BIND_ADDR}" && "${BIND_ADDR}" != "0.0.0.0" ]]; then
    host="${BIND_ADDR}"
  fi
  printf 'http://%s:%s/\n' "${host}" "${PORT}"
}

main() {
  cd "$(dirname "${BASH_SOURCE[0]}")"

  bash ./scripts/prepare-ado-ee-archive.sh

  mkdir -p docs/knowledge-sources
  if [[ -f ../ado/AGENTS.md ]]; then
    cp ../ado/AGENTS.md docs/knowledge-sources/AGENTS.md
  fi
  if [[ -f ../ado/docs/ADO_DEVELOPMENT_MODEL.md ]]; then
    cp ../ado/docs/ADO_DEVELOPMENT_MODEL.md docs/knowledge-sources/ADO_DEVELOPMENT_MODEL.md
  fi

  # Build before replacing the running container. A failed build leaves it up.
  # Fedora SELinux: rootless podman needs label=disable or RUN fails with
  # "cannot apply additional memory protection after relocation"
  if ! podman build --security-opt label=disable --network=host -t "${NAME}:latest" -f Containerfile .; then
    echo "Image build failed. Left the ${NAME} container running." >&2
    exit 1
  fi

  local state="missing"
  if podman container exists "${NAME}" >/dev/null 2>&1; then
    state="$(podman inspect --format '{{.State.Status}}' "${NAME}" 2>/dev/null || echo missing)"
  fi
  local listeners=""
  listeners="$(listeners_on_port "${PORT}")" || exit $?
  if [[ -n "${listeners}" && "${state}" != "running" ]]; then
    echo "Port ${PORT} is already in use. The ${NAME} container was not started." >&2
    echo "Another process owns this port. Preflight will not stop it." >&2
    echo "${listeners}" >&2
    exit 1
  fi

  stop_named_container
  assert_port_free "${PORT}"

  PODMAN_MOUNT=()
  if [[ -n "${XDG_RUNTIME_DIR:-}" && -S "${XDG_RUNTIME_DIR}/podman/podman.sock" ]]; then
    PODMAN_MOUNT=(-v "${XDG_RUNTIME_DIR}/podman/podman.sock:${XDG_RUNTIME_DIR}/podman/podman.sock")
  fi

  KUBE_MOUNT=()
  if [[ -f "${HOME}/.kube/config" ]]; then
    KUBE_MOUNT=(-v "${HOME}/.kube/config:/tmp/kube/config:ro" -e "KUBECONFIG=/tmp/kube/config")
  fi

  # No --rm: a crash must leave logs we can print. The next run removes this name.
  podman run -d \
    --name "${NAME}" \
    --security-opt label=disable \
    --add-host=host.containers.internal:host-gateway \
    -e AIRGAP_ARCHITECT_URL="${AIRGAP_ARCHITECT_URL:-http://host.containers.internal:8081}" \
    -e ADO_PREFLIGHT_DEPLOY_OPENSHIFT_ENABLED="${ADO_PREFLIGHT_DEPLOY_OPENSHIFT_ENABLED:-true}" \
    "${PODMAN_MOUNT[@]}" \
    "${KUBE_MOUNT[@]}" \
    -p "$(publish_spec)" \
    "localhost/${NAME}:latest"

  local url
  url="$(probe_url)"
  ready=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    state="$(podman inspect --format '{{.State.Status}}' "${NAME}" 2>/dev/null || echo missing)"
    if [[ "${state}" == "running" ]]; then
      if curl -fsS -o /dev/null "${url}"; then
        ready=1
        break
      fi
    elif [[ "${state}" == "exited" || "${state}" == "dead" || "${state}" == "missing" ]]; then
      break
    fi
    sleep 1
  done
  if [[ "${ready}" != "1" ]]; then
    echo "Preflight container ${NAME} did not stay up on port ${PORT}." >&2
    podman inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' "${NAME}" >&2 || true
    echo "----- container logs -----" >&2
    podman logs "${NAME}" >&2 || true
    podman rm -f "${NAME}" >/dev/null 2>&1 || true
    exit 1
  fi

  echo "Preflight UI: ${url}"
  echo "Airgap companion: ${AIRGAP_ARCHITECT_URL:-http://host.containers.internal:8081} (host :8081)"
  echo "Hub EE: baked at /opt/ado-ee/ado-ee.docker.tar — Push EE uses skopeo inside the pod (AAP admin password from the form)."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
