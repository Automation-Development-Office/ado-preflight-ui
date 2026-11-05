---
id: ocp-wait-operator-namespace
component: infra.automation_development_office.ocp_wait_operator
status: source-fixed
keywords: AnsibleUnicode, namespace(), ocp_wait_operator, csv, virtualization, virt, operator wait, not callable
---

# ocp_wait_operator Jinja namespace collision

## Problem

`infra.automation_development_office.ocp_wait_operator` fails while matching a ClusterServiceVersion. OpenShift virtualization and other operator installs call this role while waiting for the CSV.

## Symptoms

- `'AnsibleUnicode' object is not callable`
- The failing task is the CSV wait in `ocp_wait_operator`.

## Root cause

The play sets a string variable named `namespace`. That name shadows Jinja's `namespace()` function, so a later call tries to call the string.

## Resolution

The role no longer calls Jinja `namespace()`. CSV matching uses `json_query` for `status.phase==Succeeded` and a literal name search. A string variable named `namespace` can stay on the play.

## Simpler

OpenShift plays often store the project name in a variable called `namespace`. Jinja also has a function named `namespace()`. The wait role was calling the function and hit the string instead. The role was changed so it does not call that function.

## Discovery

The error text is the check. No cluster change is required to confirm it.

```text
# Read the job log for this exact error
'AnsibleUnicode' object is not callable
```

## Verification

Unit coverage lives in the collection. This entry does not record a new cluster job.

```text
pytest tests/unit/roles/test_ocp_wait_operator_csv_match.py
```

Status source-fixed: the role source and those unit tests cover the collision. A later runtime job on the cluster was still the old template until preflight is restarted with the rebuilt collection.

## Sources

- infra.automation_development_office/roles/ocp_wait_operator/README.md
