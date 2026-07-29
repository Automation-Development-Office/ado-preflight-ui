# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for release notes.

## When to add a changeset

Add one when a PR has a user-visible or operator-visible change (UI, bootstrap behavior, CI/release workflow).

Skip for typo-only or internal refactors with no user impact (or add an empty/`patch` note if you prefer).

## Add a changeset

```bash
npx changeset
```

Or create `.changeset/<short-name>.md` manually:

```md
---
"ado-preflight-ui": patch
---

Short description of the change.
```

Bump types: `patch`, `minor`, or `major`.

## Release flow

See the full walkthrough: [docs/RELEASING.md](../docs/RELEASING.md).

Short version:

1. Merge PRs that include changeset files.
2. Publish a GitHub Release (tag).
3. The release workflow compiles changesets into `CHANGELOG.md`, bumps `package.json`, and opens a PR to `main` that removes the consumed `.changeset/*.md` files.
4. Merge that changelog PR.

Pre-releases preview pending changesets without consuming them, and do not move GHCR `:latest`.
