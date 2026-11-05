---
id: preflight-collection-restart
component: ado-preflight-ui
status: resolved
keywords: tarball, restart_pod, old collection, infra-ado, preflight image, collection version
---

# Preflight runs the baked collection tarball

## Problem

A fix in the `infra.automation_development_office` git checkout does not show up in bootstrap. The pod is still running an older collection.

## Symptoms

- Role behavior in the job matches an older template.
- `galaxy.yml` and the tarball in the preflight image disagree.
- Ask describes a fix that the running job does not use.

## Root cause

The pod executes the `infra-automation_development_office-*.tar.gz` baked into the image. Source edits do nothing until that archive is rebuilt, copied into `ado-preflight-ui/collections/`, and the image is restarted.

## Resolution

Rebuild the collection at the current version, copy that archive into preflight `collections/`, then restart the preflight image and rerun bootstrap. A version bump is a separate release decision. The same version number can be rebuilt.

## Simpler

The pod does not read your git checkout. It reads the tarball inside the image. Rebuild that tarball and restart the image.

## Discovery

Compare the collection name in the assistant bundle (`/api/assistant/knowledge` field `collection`) with the archive you just built. They should be the same file the image copied.

## Verification

After restart, the running job uses the new role behavior. This entry is the deploy procedure itself. It does not claim a particular cluster restart already happened.

Status resolved: this is the documented deploy loop, not an open defect.

## Sources

- ado-preflight-ui/docs/ADO_DEVELOPMENT_MODEL.md
- ado-preflight-ui/docs/TROUBLESHOOTING.md
