---
id: controller-scm-credential
component: infra.automation_development_office.bootstrap_generate_env_vars
status: source-fixed
keywords: controller, scm, source control, credential, git username, bootstrap_generate_env_vars_git_scm_username
---

# Controller Source Control credential username

## Problem

The Controller project credential does not use the same Git username as the bootstrap clone.

## Symptoms

- Source Control credential username is `oauth2` while preflight Git username was set.
- The project sync authenticates as a different user than the bootstrap push.

## Root cause

The credential username is `bootstrap_generate_env_vars_git_scm_username`, resolved from preflight `git.username` with the same GitLab, GitHub, and Bitbucket rules as the clone. The password is the vault git token, not the token written into the URL.

## Resolution

Set `git.username` in the preflight JSON. Regenerate with the collection that contains that resolver. Do not put the token in the Controller credential inputs as a URL.

## Simpler

Controller stores the Git username and the token separately. The username must match the one used to push the bootstrap repo.

## Discovery

Inspect the generated `aap_config_vars` Source Control credential username. It should match the resolved Git username. The password field should be the vault reference, not the token text.

## Verification

Scenario `integration_git_scm_username` asserts the SCM username matches the resolver and that the token string is absent from `aap_config_vars`.

Status source-fixed: that scenario passed against the collection source. A live Controller project sync is not recorded here.

## Sources

- infra.automation_development_office/roles/bootstrap_generate_env_vars/README.md
- ado-preflight-ui/docs/troubleshooting/gitlab-saml-username.md
