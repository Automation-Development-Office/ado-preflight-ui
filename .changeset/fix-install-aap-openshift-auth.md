---
"ado-preflight-ui": patch
---

Fix Contoller/patching bootstrap wrongly requiring OpenShift auth when Install AAP was sticky or selected, preserve OpenShift token when Install AAP is on without an OpenShift component, fail fast with a clear message, and only stage ado-source when Hub publish is requested.
