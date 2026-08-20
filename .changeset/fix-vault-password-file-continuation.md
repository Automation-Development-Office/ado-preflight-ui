---
"ado-preflight-ui": patch
---

Fixed bootstrap failing with `--vault-password-file: command not found` when Ansible extra args were empty (line continuation dropped the vault password file off `ansible-playbook`).
