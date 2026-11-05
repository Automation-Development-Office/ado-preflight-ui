---
id: git-credential-clean-remote
component: infra.automation_development_office.bootstrap_generate_playbook_repo
status: source-fixed
keywords: git remote, credential, set-url, token in the url, pod terminal, git push, .ado-git-credentials, .git-credentials, bearer, cleanup
---

# Clean Git remote URL and credential file

## Problem

The bootstrap clone's `origin` URL contains a username and token, or push asks for a password because the credential file is missing.

## Symptoms

- `git remote -v` shows `https://user:TOKEN@host/...`.
- Push or fetch prompts for credentials.
- A token appears in `.git/config`.

## Root cause

Older runs embedded the token in the remote URL. Current preflight writes mode 0600 `.ado-git-credentials` for GitLab and GitHub, or mode 0600 `.ado-git-bearer` for Bitbucket, and sets `origin` to the clean URL. A workspace flush deletes those two files only. It does not delete `~/.git-credentials` and it does not delete them after a successful push.

## Resolution

In the preflight pod terminal, from the bootstrap clone, set the clean URL. Do not put the token back into the URL. Then push if preflight did not.

```text
git remote set-url origin https://<host>/<group>/<repo>.git
git push origin HEAD:<branch>
```

Replace the host, group, repo, and branch with the bootstrap remote. Do not commit `.git-credentials`, `.ado-git-bearer`, or preflight JSON.

## Simpler

The remote address stays a normal https URL. The token lives in a credential file Git reads, not in the URL and not in the job log.

## Discovery

```text
git status
git remote -v
git log -1 --oneline
```

## Verification

Scenario `integration_git_scm_username` checks that the remote has no token and that the credential or Bearer file is mode 0600. A live `git push` from your pod is a separate step.

Status source-fixed: the scenario passed. This entry does not record a live push.

## Sources

- infra.automation_development_office/roles/bootstrap_generate_playbook_repo/README.md
- ado-preflight-ui/docs/TROUBLESHOOTING.md
