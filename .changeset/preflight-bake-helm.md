---
"@ado/preflight-ui": patch
---

Bake OpenShift-mirror Helm into the preflight Containerfile (`/usr/local/bin/helm`) so NFS CSI bootstrap (`kubernetes.core.helm`) works offline-to-mirror during pod runs.
