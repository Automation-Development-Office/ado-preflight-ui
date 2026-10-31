---
id: scm-inventory-sync-vault
component: infra.automation_development_office.bootstrap_controller
status: source-fixed
keywords: vault, ansible_vars_enabled, source_vars, group_vars, decrypt, scm, no vault secrets found, ADO-vault, ADO-inventory, inventory source, source variables
---

# Project inventory sync and the organization vault

## Problem

An inventory source that comes from the project fails while reading the inventory file. Ansible tries to decrypt the vault files that sit next to that file.

## Symptoms

- `ERROR! Attempting to decrypt but no vault secrets found`
- The sync log names `/runner/project/inventory`.
- The inventory in AAP is named like `ADO-inventory`. The vault credential is named like `ADO-vault`.

## Root cause

Controller rejects a Vault credential on a project inventory source. The source still sees encrypted `group_vars` beside the inventory file and tries to open them. Job templates keep the organization vault credential. They are not the step that failed.

The Git file `configs/controller/inventories.yml` only names the inventories (`ADO-inventory`, `ADO-RHEL-Inventory`). It does not hold this setting. The file at the root of the same Git project, named `inventory`, is the host list the source reads.

## Resolution

In AAP, open Inventories, then `ADO-inventory` (or `ADO-RHEL-Inventory` if that one has the project source). Open the Sources tab and the source that comes from the project. Leave the credential empty. In Source variables set ANSIBLE_VARS_ENABLED to an empty value:

```yaml
ANSIBLE_VARS_ENABLED: ''
```

Save, then sync that source. Do not attach `ADO-vault` to the source. Job templates still use `ADO-vault` when a playbook runs.

For another organization, use that organization's inventory name (`DEV-inventory`) and vault name (`DEV-vault`). The Source variables line stays the same.

The next bootstrap with the current `infra.automation_development_office` collection sets this on an existing project source. A source that already sets `ANSIBLE_VARS_ENABLED` is left alone. Direct inventories are unchanged.

## Simpler

The sync only needs the host list. Tell that source to skip the encrypted variable files. The password locker stays on the job template, not on the inventory source.

## Discovery

In AAP, open the inventory named `{organization}-inventory`, for example `ADO-inventory`. The Sources tab is where Source variables are set. An empty Sources tab means this inventory is not the one that failed.

```text
AAP: Inventories -> ADO-inventory -> Sources -> Source variables
ANSIBLE_VARS_ENABLED: ''
```

## Verification

Sync the source again. It should finish and list the hosts from the inventory file. Encrypted group variables stay in the project and are opened by the job template vault credential.

Status source-fixed: the collection sets `ANSIBLE_VARS_ENABLED` on an existing project source. A live Controller sync after that change is not recorded here.

## Sources

- infra.automation_development_office/roles/bootstrap_controller/README.md
