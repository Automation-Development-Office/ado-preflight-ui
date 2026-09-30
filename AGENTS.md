# AGENTS.md — ado-preflight-ui

Containerized questionnaire + runner that turns operator answers into preflight JSON and invokes `infra.ado` bootstrap behavior.

**This repo is the form/runner. Portable bootstrap semantics live in `ado` / `infra.ado`.**

## Product source-of-truth rule

For a product capability:

1. verify/implement environment-agnostic, repeatable behavior in `infra.ado` first;
2. then expose/configure that capability through preflight UI as needed;
3. verify generated bootstrap output;
4. never make UI-only logic the sole implementation of bootstrap semantics.

## Environment agnostic + repeatable

- Do not hard-code Chad's lab URLs, domains, clusters, namespaces, credentials, storage classes, orgs, SCM endpoints, or other local values into reusable UI defaults/normalization.
- Use established payload fields and configuration inputs.
- Import/export of the same desired-state JSON must be stable.
- UI and CLI execution of equivalent intent must remain equivalent.
- Preserve disconnected operation; no new internet dependency without explicit approval/documentation.

## Hard rules

| Do | Do not |
|---|---|
| Keep UI = CLI for the same preflight JSON + equivalent `-e` flags | Put bootstrap semantics only in `server.js` / `App.jsx` |
| Keep async bootstrap: `POST /api/bootstrap` -> 202, then poll logs/result | Drop async/recap behavior or replace it with a synchronous route |
| Let form values override imported JSON only where the existing contract says so | Invent new payload keys without updating ADO contract |
| Schema changes: update `server.js` + `src/App.jsx` **and** `ado` env generation/contract | Change payload shape in UI only |
| After collection fixes, rebuild/copy the collection tarball used by this container | Assume neighboring live `ado` checkout is what the runtime executes |
| Add/update `.changeset/*` for user-visible UI behavior | Hand-wave release/change documentation |
| OpenShift Apps Domain autofills as `apps.<Base Infrastructure Domain>` and routed hostnames as `<prefix>.<apps_domain>`, but both stay editable. A custom value sets `apps_domain_manual` / `hostname_manual` | Lock those fields read-only, or overwrite a typed override on the next domain change |
| Quay **Use existing MinIO** shows API host, port, namespace, bucket, access key, and secret key on the Quay tab. It does not select or deploy MinIO | Hide those fields, or add Deploy MinIO because the Quay option is checked |
| Every password/token/secret field has Show/Hide and remasks after 30 seconds (`SECRET_REVEAL_MS`) | Ship a bare `type="password"` input with no Show button or no auto-hide |

Preflight executes the baked `collections/infra-ado-*.tar.gz` inside the container.

## Before editing

1. Read this file and `../ado/docs/ADO_DEVELOPMENT_MODEL.md`.
2. Inspect the related `infra.ado` role/schema/generator first.
3. Inspect current `server.js` normalization and `src/App.jsx` payload creation.
4. State the existing pattern being reused.
5. Decide whether the requested change belongs in ADO first.

## Validation

For UI changes, run the repository's existing build/test/lint workflow. At minimum, when applicable:

```bash
npm run build
```

Also run any repo-defined test/lint scripts in `package.json` and CI for the changed surface. For schema/bootstrap changes, validation is incomplete until the matching `infra.ado` lint/Molecule checks pass and the rebuilt collection tarball is tested by Preflight.

After `ado` collection changes:

```bash
cd ../ado
ansible-galaxy collection build -o /tmp
cp /tmp/infra-ado-*.tar.gz ../ado-preflight-ui/collections/
```

Then exercise the normal preflight path with a saved JSON payload and verify `/api/bootstrap/result` returns JSON rather than HTML when idle.

## Release discipline

User-visible changes use Changesets under `.changeset/`. Preserve the repository's established release workflow and GHCR tagging semantics.

## ADO-LAB Reset

When the user says `ADO-LAB Reset`, read `../ado/docs/ADO-LAB-RESET.md`, then read local uncommitted agent rules if present. Never commit `.cursor/`, secrets, or preflight JSON exports.
