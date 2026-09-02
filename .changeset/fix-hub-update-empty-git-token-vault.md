---
"ado-preflight-ui": patch
---

Fixed hub-only / prod bootstrap regression when Git token is empty: `ansible-playbook` line continuation dropped `--vault-password-file` (vault decrypt failed, exit 127 `-e: command not found`). Optional env `group_vars` load when overwrite refreshes a single env dir.
