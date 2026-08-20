---
"@ado/preflight-ui": minor
---

Hub-only / EE push now always ensures the General Contoller org exists and creates/attaches a Container Registry credential so ADO-ee pulls stop ImagePullBackOff. Checking collection publish, Push EE, or Run Hub updates only also enables Galaxy/registry credential setup.
