# AGENTS.md — ado-preflight-ui

Containerized questionnaire + runner that turns operator answers into a bootstrap
repo via `infra.ado`. This repo is the **form**; bootstrap logic lives in `ado`.

## Always-on reminder

Committed copy (ado): `../ado/docs/ADO-LAB-RESET.md` (or `ado/docs/ADO-LAB-RESET.md`).

```text
ADO lab: say "ADO-LAB Reset" to reload context. Read each open repo's AGENTS.md.
Lab rules: /home/chelliot/openshift/git/github-ado/.cursor/rules/local/
Do not ask for passwords — use lab-creds + ~/Downloads/ado-preflight-*.json.
Fix code not Controller. User runs restart_pod.sh / preflight / sync / relaunch.
```

## Lab context reload

When the user says **`ADO-LAB Reset`** (any casing), treat it as a full context reload.
Do not ask them to paste the checklist — the phrase **is** the checklist.

1. Re-read `../.cursor/rules/local/` (`chad-lab-ado.mdc`, `lab-creds.mdc`, `agent-reset.mdc`)
2. Re-read `.cursor/rules/local/chad-lab-preflight.mdc` in this repo
3. Skim portal / lab-tools local rules if the task touches them
4. Load newest matching `~/Downloads/ado-preflight-*.json`
5. Confirm baked `collections/infra-ado-*.tar.gz` matches `ado/galaxy.yml`
6. **Fix code, not Controller** — agent builds/copies tarball; user redeploys this UI and re-bootstraps

`.cursor/` is gitignored. Never commit preflight JSON exports or secrets.

## Canonical path

`/home/chelliot/openshift/git/github-ado/ado-preflight-ui` — **not** `…/git/ado-preflight-ui`.

## Cross-repo map

```text
ado/                    → infra.ado collection source
ado-preflight-ui/       → this repo — form + server.js + baked tarball
bootstrap-sample/       → generated bootstrap output (Controller SCM)
ado-cluster-portal/     → lab portal (links to this UI)
lab-tools-dont-delete/  → IdM / VPN / Satellite ops (separate Controller project)
```

## Hard rules (this repo)

| Do | Do not |
|----|--------|
| Keep UI ≡ CLI for the same preflight JSON + `-e` flags | Put bootstrap semantics only in `server.js` / `App.jsx` |
| Keep async bootstrap: `POST /api/bootstrap` → **202**, poll logs/result | `git checkout` the completion path; drop async/recap |
| Form values override imported JSON for runtime (verbosity, etc.) | Treat browser `Unexpected token '<'` as ansible failure (often route timeout) |
| Schema changes: update `server.js` + `src/App.jsx` **and** `ado` env gen | Change payload shape in UI only |
| After UI-only fixes: `npm run build` + `./restart_pod.sh` | Assume live git checkout of `ado` is what the container runs |

Preflight runs the collection from `collections/infra-ado-*.tar.gz` inside the container.

## Deploy

| Target | How |
|--------|-----|
| Local | `./restart_pod.sh` → http://127.0.0.1:8080 |
| OpenShift | Image push → `ado-portal` → rollout → hard refresh |

Smoke when idle: `GET /api/bootstrap/result` returns JSON (not HTML).

## After `ado` collection fixes

```bash
cd ../ado && ansible-galaxy collection build -o /tmp
cp /tmp/infra-ado-*.tar.gz ../ado-preflight-ui/collections/
# User: ./restart_pod.sh → import JSON → bootstrap → push → Controller sync → relaunch
```
