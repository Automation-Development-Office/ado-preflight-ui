---
id: devspaces-samples-dashboard
component: infra.automation_development_office.ocp_devspaces
status: source-fixed
keywords: devspaces, dev spaces, dashboard, samples, sample, che, empty.yaml, ocp_devspaces, registry, namespace, namespace()
---

# Dev Spaces dashboard samples

## Problem

The Dev Spaces dashboard does not show the samples you configured, or a sample card is blank because it has no URL.

## Symptoms

- Stock getting-started samples still appear.
- A custom sample card is missing.
- GitOps export of Dev Spaces does not include the dashboard sample ConfigMaps.

## Root cause

`ocp_devspaces_disable_default_samples` replaces the stock samples only when it is true. A blank sample `url` is filled with that Che host's built-in Empty Workspace `empty.yaml` so the card still shows. That fill does not call Jinja `namespace()`, so a string variable named `namespace` does not fail the task. The ConfigMap is written to the CheCluster dashboard namespace. The first GitOps export covers Namespace and CheCluster only. Dashboard sample ConfigMaps, the status exporter, the operator subscription, and extra routes are not in that export.

## Resolution

Set `ocp_devspaces_disable_default_samples` and `ocp_devspaces_custom_samples` (`displayName`, `description`, `tags`, `url`, optional `icon`). Icon source is `bundled` (`files/ado-sample-icon.png`) or `upload`. Direct install is the default. `ocp_devspaces_delivery_mode: generate` only renders the Namespace and CheCluster.

## Simpler

Custom samples are a direct-install setting. A sample with no URL still gets the built-in empty workspace so the dashboard card can render. The GitOps preview does not export those dashboard ConfigMaps.

## Discovery

Compare preflight Dev Spaces options with `ocp_devspaces_custom_samples` and `ocp_devspaces_disable_default_samples` in the generated vars. This entry has no recorded cluster command.

## Verification

The role README in the collection documents this behavior. This entry does not record a Molecule run or a live dashboard check.

Status source-fixed: the behavior is in the role source and README. It is not a recorded cluster verification.

## Sources

- infra.automation_development_office/roles/ocp_devspaces/README.md
