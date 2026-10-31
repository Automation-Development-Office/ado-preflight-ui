---
id: gitlab-saml-username
component: infra.automation_development_office.bootstrap_generate_playbook_repo
status: source-fixed
keywords: gitlab, saml, oauth2, git.username, username, pat, token, x-token-auth, asking for a username
---

# GitLab username and personal access token

## Problem

Git clone or push asks for a username, or the bootstrap uses `oauth2` when the GitLab account name was supposed to be used. GitLab SAML login in the browser is separate from Git.

## Symptoms

- Git prompts for a username or password.
- The Controller Source Control credential username is `oauth2` even though a named GitLab account should be used.
- Blank Bitbucket becomes `x-token-auth`. Blank GitLab or GitHub becomes `oauth2`.

## Root cause

HTTPS Git uses a username plus a personal access token. It does not perform SAML. A typed `git.username` is that username. An empty GitLab or GitHub username stays `oauth2`. An empty Bitbucket username stays `x-token-auth`. The token is the password.

## Resolution

Type the GitLab account name in preflight Git username when the host should not use `oauth2`. Leave it blank only when `oauth2` (GitLab/GitHub) or `x-token-auth` (Bitbucket) is correct. CLI bootstrap with only `preflight_json` resolves the same name. The token stays in the vault, not in the remote URL.

## Simpler

The browser SAML login is not what Git uses. Git wants the account name plus a personal access token. If you leave the username empty on GitLab, ADO uses `oauth2`.

## Discovery

```text
git remote -v
```

The URL must be `https://host/group/repo.git` with no user and no token.

## Verification

Collection scenario `integration_git_scm_username` checks the resolved username, the clean remote, and the Controller SCM username. A live GitLab push from the pod is still a separate check.

```text
git remote -v
```

Status source-fixed: Molecule covered the resolver and credential files. A live GitLab clone from your pod is not recorded in this entry.

## Sources

- infra.automation_development_office/roles/bootstrap_generate_playbook_repo/README.md
- ado-preflight-ui/docs/troubleshooting/git-credential-clean-remote.md
