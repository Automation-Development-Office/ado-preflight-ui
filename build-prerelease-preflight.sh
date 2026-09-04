export TAG=1.0.17-prerelease
export IMG=ghcr.io/automation-development-office/ado-preflight-ui
podman tag localhost/ado-preflight-ui:latest ghcr.io/ automation-development-office/ado-preflight-ui::${TAG}
podman push   --digestfile /tmp/ghcr-digest.txt   "${IMG}:${TAG}"   "docker://${IMG}:${TAG}"
