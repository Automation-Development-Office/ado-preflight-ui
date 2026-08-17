#!/bin/bash
set -euo pipefail

IMAGE="docker.io/grafana/grafana:13.1.3"

CVES=(
  CVE-2026-62909
  CVE-2026-62901
  CVE-2026-5674
  CVE-2026-11940
  CVE-2026-60002
  CVE-2026-57456
)

if ! command -v trivy >/dev/null 2>&1; then
  echo "ERROR: trivy is not installed."
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

echo "Scanning: $IMAGE"
echo

trivy image \
  --quiet \
  --format json \
  "$IMAGE" > "$TMP"

printf "%-18s %-10s %-12s %-20s\n" "CVE" "STATUS" "SEVERITY" "PACKAGE"
printf "%-18s %-10s %-12s %-20s\n" "------------------" "----------" "------------" "--------------------"

for CVE in "${CVES[@]}"; do

  MATCH=$(jq -r --arg CVE "$CVE" '
    [
      .Results[]?.Vulnerabilities[]?
      | select(.VulnerabilityID == $CVE)
      | [
          .Severity,
          .PkgName,
          (.InstalledVersion // "-"),
          (.FixedVersion // "-")
        ]
    ][0] // empty
    | @tsv
  ' "$TMP")

  if [[ -z "$MATCH" ]]; then
    printf "%-18s %-10s %-12s %-20s\n" "$CVE" "FIXED" "-" "-"
  else
    SEV=$(echo "$MATCH" | cut -f1)
    PKG=$(echo "$MATCH" | cut -f2)
    INSTALLED=$(echo "$MATCH" | cut -f3)
    FIXED=$(echo "$MATCH" | cut -f4)

    printf "%-18s %-10s %-12s %-20s\n" "$CVE" "PRESENT" "$SEV" "$PKG"
    echo "    Installed: $INSTALLED"
    echo "    Fixed In : $FIXED"
  fi
done
