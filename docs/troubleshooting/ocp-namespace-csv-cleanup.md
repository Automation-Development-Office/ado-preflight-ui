---
id: ocp-namespace-csv-cleanup
component: infra.automation_development_office.ocp_namespace
status: source-fixed
keywords: ocp_namespace, ocp_absent_cleanup, CSV, finalizers, olm.copiedFrom, namespace delete, test-namespace
---

# Namespace delete started removing Operator CSVs

## Problem

`infra.automation_development_office.ocp_namespace` with `state: absent` deleted more than the requested Namespace. It entered `ocp_absent_cleanup` and selected every ClusterServiceVersion in that namespace, including OLM copies of cluster operators, then stripped CSV finalizers.

## Symptoms

- A play asked to delete one namespace, for example `test-namespace`.
- The job log shows `ocp_absent_cleanup` and tasks named `Delete CSVs` and `Strip CSV finalizers`.
- CSV names include operators that were not installed in that namespace, such as cert-manager, Compliance Operator, Dev Spaces, GitOps, RHACS, and Quay.
- The same CSV name exists in many namespaces.

## Root cause

`ocp_namespace` called `ocp_absent_cleanup` with OLM and workload sweeps defaulting to true. An empty CSV name filter selected every CSV in the namespace. Those objects are often OLM copies: label `olm.copiedFrom` names the operator namespace, and annotation `olm.operatorNamespace` does too. Annotation `olm.copiedFrom` is often missing. Deleting or stripping finalizers on those copies is not namespace deletion.

Collection `2.1.2` has this behavior. The correction is in the collection source. Replacing only the installed tarball without this source change does not fix the next build.

## Resolution

`state: absent` now deletes only the requested Namespace resource. It refuses platform namespaces. It does not sweep CSVs, strip CSV finalizers, delete workloads, or call namespace `/finalize`.

If the namespace stays present, the role reports the phase and finalizers and fails. Advanced cleanup is separate. Set `ocp_namespace_advanced_cleanup: true` and only the authorize flag for the action you intend. Copied CSVs stay unless `ocp_namespace_absent_delete_copied_csvs` is true. CSV finalizer stripping also requires `ocp_namespace_absent_strip_csv_finalizers: true`.

## Simpler

Deleting a namespace was also deleting Operator CSVs that OpenShift copies into every namespace. Namespace deletion no longer does that. Cleaning a stuck namespace is a separate, explicit choice.

## Discovery

Read-only. Run this before any further namespace deletion test.

```text
oc whoami --show-server
oc get ns test-namespace --ignore-not-found
oc get csv -n test-namespace -o json | jq -r '.items[] | [.metadata.name, (.metadata.labels["olm.copiedFrom"] // "NO_LABEL"), (.metadata.annotations["olm.operatorNamespace"] // "NO_OWNER"), (.metadata.deletionTimestamp // "-")] | @tsv'
oc get co --no-headers | awk '$3!="True" || $4!="False" || $5!="False"'
oc get csv -A -o json | jq '[.items[] | select(.metadata.deletionTimestamp != null)] | length'
```

`olm.copiedFrom` on the label, or `olm.operatorNamespace` pointing at a different namespace, means the CSV is a copy. A missing `deletionTimestamp` means that CSV is not currently being deleted. No lines from the ClusterOperator command means each operator reports Available=True, Progressing=False, Degraded=False.

## Verification

Unit tests cover the selection rules and the role defaults. They do not delete anything on a cluster.

```text
python3 tests/unit/roles/test_ocp_absent_cleanup.py
```

Status source-fixed: the collection source and those unit tests refuse unsolicited CSV deletion. A runtime delete of an expendable namespace has not been recorded after this change. Do not use that test on a namespace that contains operators you need.

## Sources

- infra.automation_development_office/roles/ocp_namespace/README.md
- infra.automation_development_office/roles/ocp_absent_cleanup/README.md
