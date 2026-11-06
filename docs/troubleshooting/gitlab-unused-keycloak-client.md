---
id: gitlab-unused-keycloak-client
component: infra.automation_development_office.bootstrap_generate_env_vars
status: source-fixed
keywords: gitlab, keycloak, rhbk, oidc, unused client, rhbk_clients, create_client
---

# GitLab unused Keycloak client

## Problem

Selecting GitLab adds a Keycloak client that no GitLab configuration role uses.

## Symptoms

- GitLab is selected in Preflight.
- A `gitlab` client appears in `component_config.rhbk.clients` and generated `rhbk_clients`.
- `ADO | Deploy RHBK Client` creates or updates that client.
- No GitLab OIDC role consumes the client.

## Root cause

The Preflight GitLab preset auto-added a Keycloak client and set `gitlab.oidc_enabled`. Overlay treated that row like Grafana or BookStack and copied it into `rhbk_clients`. GitLab install/auth in ADO does not configure GitLab OIDC.

## Resolution

Selecting GitLab no longer auto-adds a Keycloak client. Overlay omits `source: gitlab` rows and, when GitLab is selected, the historical `gitlab` / `oidc_client_id` from generated `rhbk_clients`. Existing Keycloak clients and preflight rows are not deleted. A GitLab OIDC role is not implemented. Manually configured GitLab authentication is left alone.

## Simpler

GitLab as an app does not mean ADO should create a GitLab Keycloak client. Existing clients stay. ADO just stops creating unused ones.

## Discovery

This entry records no live cluster command. Check generated `vars_rhbk.yml` `rhbk_clients` after a GitLab-selected generate: the `gitlab` id should be absent unless it was hand-edited into that dict.

## Verification

Python overlay and Preflight JS tests cover GitLab selected without auto-add, existing JSON rows kept, leftover `oidc_enabled` still needing an explicit client ID, and mixed Grafana/BookStack/NetBox/GitLab. Live Controller jobs are not recorded here.

Status source-fixed: auto-add and overlay skip are in source. A live generate/bootstrap is not recorded in this entry.

## Sources

- infra.automation_development_office/roles/bootstrap_generate_env_vars/README.md
- ado-preflight-ui/src/rhbkClients.mjs
