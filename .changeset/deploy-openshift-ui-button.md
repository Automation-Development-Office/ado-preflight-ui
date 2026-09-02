---
"ado-preflight-ui": minor
---

Add **Deploy to OpenShift** (Actions menu): ``deploy/deploy.sh`` + ``deploy/preflight.yaml``, async ``POST /api/deploy/openshift``. Mounts kubeconfig/podman socket in ``restart_pod.sh`` for local testing.
