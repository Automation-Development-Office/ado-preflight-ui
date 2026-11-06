---
id: bookstack-oidc-empty-secret
component: infra.automation_development_office.bookstack_openshift
status: source-fixed
keywords: bookstack, oidc, client secret, empty secret, keycloak, rhbk, ocp_rhbk_client_secrets
---

# BookStack OIDC empty client secret

## Problem

ADO creates or uses a Keycloak client for BookStack, but BookStack receives an empty OIDC client secret and login fails.

## Symptoms

- BookStack OIDC is enabled and a Keycloak client ID is set.
- The `bookstack-app` Secret has an empty `oidc-client-secret`.
- BookStack OAuth configuration is applied anyway.
- A previously working secret can be overwritten with an empty value.

## Root cause

Generated vault writes `bookstack_oidc_client_secret` only when preflight supplied one. The BookStack role defaulted the secret to empty and patched that value into `bookstack-app` without reading Keycloak. Ownership (`create_client`) was not the cause: retrieving an existing client's secret is allowed for unmanaged clients.

## Resolution

The BookStack role now resolves the secret before OIDC is applied. An explicit `bookstack_oidc_client_secret` is kept. When it is empty, `ocp_rhbk_client_secrets` reads the Keycloak client secret (managed or unmanaged). Missing client, denied admin access, or an empty confidential-client secret fails the job. An empty value is not written over a working Secret. The role does not create or update the Keycloak client.

## Simpler

If you did not paste a BookStack client secret, ADO must read it from Keycloak before configuring BookStack. An empty secret is a hard failure, not a silent skip.

## Discovery

This entry records no live cluster command. Inspect generated `vars_bookstack.yml` / `vault_bookstack.yml` for an explicit secret, then the BookStack OIDC job for the assert `BookStack OIDC is enabled but no client secret is available`.

## Verification

Python overlay and role YAML contract tests cover explicit secret, empty vault, unmanaged client, fetch-before-apply, no-log, and fail-closed empty secret. Live Keycloak retrieval is not recorded in this entry.

Status source-fixed: the fetch and assert are in `bookstack_openshift`. A live BookStack OIDC job is not recorded here.

## Sources

- infra.automation_development_office/roles/bookstack_openshift/README.md
- infra.automation_development_office/roles/bookstack_openshift/tasks/resolve-oidc-secret.yml
