#!/usr/bin/env bash
# Build (optional), push to cluster registry, apply manifests, rollout preflight UI.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMESPACE="${NAMESPACE:-ado-portal}"
IMAGE_NAME="${IMAGE_NAME:-ado-preflight-ui}"
TAG="${TAG:-latest}"
SKIP_BUILD="${SKIP_BUILD:-0}"
OPENSHIFT_API="${OPENSHIFT_API:-}"
OPENSHIFT_TOKEN="${OPENSHIFT_TOKEN:-}"
OPENSHIFT_APPS_DOMAIN="${OPENSHIFT_APPS_DOMAIN:-}"
ROUTE_HOST="${ROUTE_HOST:-}"
ADO_PREFLIGHT_TERMINAL_ENABLED="${ADO_PREFLIGHT_TERMINAL_ENABLED:-true}"

log() { printf '==> %s\n' "$*"; }

require_oc() {
  if ! command -v oc >/dev/null 2>&1; then
    echo "ERROR: oc CLI not found. Install openshift-clients or mount oc into the container." >&2
    exit 1
  fi
}

login_cluster() {
  require_oc
  if [[ -n "${OPENSHIFT_API}" && -n "${OPENSHIFT_TOKEN}" ]]; then
    log "Logging into OpenShift API ${OPENSHIFT_API}"
    oc login "${OPENSHIFT_API}" --token="${OPENSHIFT_TOKEN}" --insecure-skip-tls-verify=true >/dev/null
  elif [[ -z "${KUBECONFIG:-}" && ! -f "${HOME}/.kube/config" ]]; then
    echo "ERROR: Set OPENSHIFT_API + OPENSHIFT_TOKEN or KUBECONFIG." >&2
    exit 1
  fi
}

build_image() {
  if [[ "${SKIP_BUILD}" == "1" ]]; then
    log "Skipping image build (SKIP_BUILD=1)"
    return 0
  fi
  if ! command -v podman >/dev/null 2>&1; then
    log "podman not available — skipping local build (use SKIP_BUILD=1 and pre-pushed IMAGE)"
    return 0
  fi
  log "Preparing ADO EE archive"
  bash "${ROOT_DIR}/scripts/prepare-ado-ee-archive.sh"
  log "Building ${IMAGE_NAME}:${TAG}"
  podman build --security-opt label=disable --network=host \
    -t "${IMAGE_NAME}:${TAG}" -f "${ROOT_DIR}/Containerfile" "${ROOT_DIR}"
}

push_image() {
  if [[ "${SKIP_BUILD}" == "1" && -n "${IMAGE:-}" ]]; then
    export ADO_PREFLIGHT_IMAGE="${IMAGE}"
    log "Using pre-set IMAGE=${ADO_PREFLIGHT_IMAGE}"
    return 0
  fi
  if ! command -v podman >/dev/null 2>&1; then
    if [[ -n "${IMAGE:-}" ]]; then
      export ADO_PREFLIGHT_IMAGE="${IMAGE}"
      log "Using IMAGE=${ADO_PREFLIGHT_IMAGE}"
      return 0
    fi
    echo "ERROR: podman unavailable and IMAGE unset." >&2
    exit 1
  fi

  log "Ensuring namespace ${NAMESPACE}"
  oc new-project "${NAMESPACE}" 2>/dev/null || oc project "${NAMESPACE}" >/dev/null

  REGISTRY_HOST="$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}')"
  if [[ -z "${REGISTRY_HOST}" ]]; then
    echo "ERROR: openshift-image-registry default-route not found" >&2
    exit 1
  fi

  REMOTE_IMAGE="${REGISTRY_HOST}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"
  log "Logging into ${REGISTRY_HOST}"
  oc registry login --registry="${REGISTRY_HOST}" --insecure=true >/dev/null

  log "Tagging and pushing ${REMOTE_IMAGE}"
  podman tag "localhost/${IMAGE_NAME}:${TAG}" "${REMOTE_IMAGE}" 2>/dev/null \
    || podman tag "${IMAGE_NAME}:${TAG}" "${REMOTE_IMAGE}"
  podman push --tls-verify=false "${REMOTE_IMAGE}"
  export ADO_PREFLIGHT_IMAGE="image-registry.openshift-image-registry.svc:5000/${NAMESPACE}/${IMAGE_NAME}:${TAG}"
}

resolve_route_host() {
  if [[ -n "${ROUTE_HOST}" ]]; then
    export ADO_PREFLIGHT_ROUTE_HOST="${ROUTE_HOST}"
    return 0
  fi
  if [[ -n "${OPENSHIFT_APPS_DOMAIN}" ]]; then
    export ADO_PREFLIGHT_ROUTE_HOST="ado-preflight-ui-${NAMESPACE}.apps.${OPENSHIFT_APPS_DOMAIN}"
    return 0
  fi
  EXISTING="$(oc get route ado-preflight-ui -n "${NAMESPACE}" -o jsonpath='{.spec.host}' 2>/dev/null || true)"
  if [[ -n "${EXISTING}" ]]; then
    export ADO_PREFLIGHT_ROUTE_HOST="${EXISTING}"
    return 0
  fi
  echo "ERROR: Set ROUTE_HOST or OPENSHIFT_APPS_DOMAIN." >&2
  exit 1
}

apply_manifests() {
  export ADO_PREFLIGHT_TERMINAL_ENABLED
  resolve_route_host
  log "Applying manifests (image=${ADO_PREFLIGHT_IMAGE}, route=${ADO_PREFLIGHT_ROUTE_HOST})"
  if command -v envsubst >/dev/null 2>&1; then
    envsubst '${ADO_PREFLIGHT_IMAGE} ${ADO_PREFLIGHT_ROUTE_HOST} ${ADO_PREFLIGHT_TERMINAL_ENABLED}' \
      < "${ROOT_DIR}/deploy/preflight.yaml" | oc apply -f -
  else
    python3 - <<'PY'
import os, pathlib, sys
root = pathlib.Path(os.environ["ROOT_DIR"])
text = (root / "deploy" / "preflight.yaml").read_text()
for key in ("ADO_PREFLIGHT_IMAGE", "ADO_PREFLIGHT_ROUTE_HOST", "ADO_PREFLIGHT_TERMINAL_ENABLED"):
    text = text.replace("${" + key + "}", os.environ.get(key, ""))
    text = text.replace("${" + key + ":-true}", os.environ.get(key, "true"))
pathlib.Path("/tmp/preflight-rendered.yaml").write_text(text)
PY
    oc apply -f /tmp/preflight-rendered.yaml
  fi
}

rollout() {
  log "Rolling out deployment/ado-preflight-ui"
  oc rollout restart "deployment/ado-preflight-ui" -n "${NAMESPACE}"
  oc rollout status "deployment/ado-preflight-ui" -n "${NAMESPACE}" --timeout=300s
  ROUTE="$(oc get route ado-preflight-ui -n "${NAMESPACE}" -o jsonpath='{.spec.host}')"
  log "Preflight UI: https://${ROUTE}"
}

cd "${ROOT_DIR}"
export ROOT_DIR
login_cluster
build_image
push_image
apply_manifests
rollout
