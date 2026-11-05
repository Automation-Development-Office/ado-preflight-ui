---
id: aap-inventory-timeout
component: infra.automation_development_office.bootstrap_controller
status: source-fixed
keywords: inventory, timeout, timed out, request_timeout, organizations, read operation timed out, ansible.controller, 10 second, 120
---

# Controller inventory lookup timeout

## Problem

Creating an inventory fails while looking up the Controller organization by name.

## Symptoms

- Task `AAP 2.5+ | Create inventories directly` fails.
- The URL contains `organizations/?name=` and the message `The read operation timed out`.
- The earlier organization check can succeed, so its failure task is skipped.

## Root cause

`ansible.controller` waits 10 seconds by default. The inventory module looks up the organization before it writes the inventory. A slow Controller API exceeds 10 seconds even when the organization already exists.

## Resolution

`infra.automation_development_office` sets `bootstrap_controller_request_timeout` to 120 seconds and passes that to the inventory and the other Controller apply calls. Rebuild the `infra-ado` tarball that preflight runs, restart preflight, and rerun bootstrap. Do not raise the live Controller gateway timeout as the permanent fix.

## Simpler

The inventory step asks Controller for the organization and used to give up after 10 seconds. The collection now waits 120 seconds. The pod must be restarted with the new collection before that wait is what runs.

## Discovery

Read the failing task URL. A timeout on `organizations/?name=` is this issue, not a missing organization by itself.

```text
# In the bootstrap log, confirm the failing URL contains:
organizations/?name=
```

## Verification

After restart, rerun the same bootstrap. The inventory task should get past the organization lookup. This entry does not record that rerun.

Status source-fixed: the timeout is in the collection source and the rebuilt tarball. Cluster confirmation is still pending.

## Sources

- infra.automation_development_office/roles/bootstrap_controller/README.md
