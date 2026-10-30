# Troubleshooting index

Structured entries under `docs/troubleshooting/` are what ADO Assistant
searches first. Each file has an id, component, status, and keywords.
Status is `proposed`, `source-fixed`, `runtime-verified`, or `resolved`.
`resolved` is only used when the entry itself is the documented procedure,
or when a runtime check was actually recorded.

| Entry | Status | Subject |
| --- | --- | --- |
| `ocp-wait-operator-namespace.md` | source-fixed | Jinja `namespace()` shadowed by a string variable |
| `gitlab-saml-username.md` | source-fixed | GitLab account name plus a personal access token |
| `controller-scm-credential.md` | source-fixed | Controller Source Control username matches Git |
| `aap-inventory-timeout.md` | source-fixed | Inventory organization lookup waited 10 seconds |
| `scm-inventory-sync-vault.md` | source-fixed | Project inventory sync skips vaulted group_vars |
| `git-credential-clean-remote.md` | source-fixed | Remote URL without a token; credential file |
| `preflight-collection-restart.md` | resolved | Pod runs the baked collection tarball |
| `devspaces-samples-dashboard.md` | source-fixed | Dashboard samples and GitOps export limits |
| `grafana-postgres.md` | source-fixed | SQLite default, PostgreSQL, and data reset |

Do not store passwords, tokens, private keys, or live environment values in
these files. Commands in an entry are the ones that were documented with the
fix. The assistant copies those commands. It does not invent new ones.

Pod terminal, in the bootstrap clone, when a remote URL contains a token:

```text
git status
git remote -v
git remote set-url origin https://<host>/<group>/<repo>.git
```

Use the real host, group, and repo. Do not put the token in the URL.
