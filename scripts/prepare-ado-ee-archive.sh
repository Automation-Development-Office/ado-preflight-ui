#!/usr/bin/env bash
# Prepare vendor/ado-ee.docker.tar for disconnected bake into the preflight UI image.
# Uses a *local* image already on this machine (no runtime internet required later).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p vendor
OUT=vendor/ado-ee.docker.tar
SRC="${ADO_EE_SOURCE_IMAGE:-ghcr.io/automation-development-office/ado-ee:latest}"

if [[ -f "$OUT" && "${ADO_EE_FORCE_REFRESH:-}" != "1" ]]; then
  echo "Using existing $OUT ($(du -h "$OUT" | awk '{print $1}'))"
  exit 0
fi

if ! podman image exists "$SRC"; then
  echo "ERROR: $SRC not found locally." >&2
  echo "Load/tag it on this build host first (disconnected bake cannot pull at runtime)." >&2
  echo "  podman load -i ado-ee.tar   # or copy from an internal mirror once at build time" >&2
  exit 1
fi

echo "Saving $SRC -> $OUT (docker-archive for skopeo)..."
rm -f "$OUT"
podman save -o "$OUT" "$SRC"
echo "Wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
