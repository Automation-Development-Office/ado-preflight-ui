podman rm -f ado-preflight-ui 2>/dev/null || true
podman build --no-cache -t ado-preflight-ui:latest -f Containerfile .
podman run --rm -d --name ado-preflight-ui -p 8080:8080 localhost/ado-preflight-ui:latest
