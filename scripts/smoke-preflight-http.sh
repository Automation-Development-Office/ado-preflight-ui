#!/usr/bin/env bash
# Confirm a running Preflight answers HTTP 200. Does not build, replace, or stop a container.
set -euo pipefail

url="${1:-http://127.0.0.1:8080/}"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "${url}" || true)"
if [[ "${code}" != "200" ]]; then
  echo "Preflight smoke failed: ${url} returned ${code:-no response}" >&2
  exit 1
fi
echo "Preflight smoke ok: ${url} ${code}"
