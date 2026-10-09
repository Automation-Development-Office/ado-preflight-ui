---
"ado-preflight-ui": patch
---

OpenShift app hostnames (Grafana, Keycloak, GitLab, Quay, Zabbix, and the other routed apps) inherit OpenShift apps domain. The field is read-only so the domain is not typed per component.
