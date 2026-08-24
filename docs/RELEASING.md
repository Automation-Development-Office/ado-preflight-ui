# Releasing ADO Preflight UI

This guide walks through creating a GitHub Release that builds the container image, tags it in GHCR, and (for full releases) updates the changelog via Changesets.

The automation lives in [`.github/workflows/release-container.yml`](../.github/workflows/release-container.yml). It runs when a GitHub Release is **published**.

---

## Before you start

1. Work is merged to `main` (or the commit you will tag).
2. User-visible PRs include Changesets under [`.changeset/`](../.changeset/) (see [Adding a changeset](#adding-a-changeset-during-development)).
3. You know whether this is a **full release** or a **pre-release**.
4. You know the **exact tag name** you will use. For a full release, that tag must match what Changesets will bump `package.json` to (see [Version alignment](#version-alignment)).
5. The **`ado-ee`** image is available on GHCR (`ghcr.io/<org>/ado-ee:latest`). The release workflow pulls it to build `vendor/ado-ee.docker.tar` (that file is gitignored and required by `Containerfile`).

Current package version is in [`package.json`](../package.json). Pending Changesets determine the next bump (`patch` / `minor` / `major`).

---

## Adding a changeset during development

For each PR that operators or users would notice:

```bash
npx changeset
```

Or add a file manually, for example `.changeset/fix-smoke-test.md`:

```md
---
"ado-preflight-ui": patch
---

Skip Demo Job Template smoke test when disabled in AAP General settings.
```

| Bump | Use when |
|------|----------|
| `patch` | Bug fix or small non-breaking improvement |
| `minor` | New feature or notable enhancement |
| `major` | Breaking change |

Skip Changesets for typo-only or pure internal refactors.

More detail: [`.changeset/README.md`](../.changeset/README.md).

---

## Choose the release type

### Full release (stable)

- GitHub: **do not** check “Set as a pre-release”.
- Tag must be stable semver: `1.2.0` or `v1.2.0` (no `-alpha` / `-rc` suffix).
- Workflow will:
  - Run `changeset version` (update `CHANGELOG.md`, bump `package.json`, delete consumed `.changeset/*.md` files).
  - Build and push the image.
  - Tag GHCR with **both** the release tag **and** `:latest`.
  - Attach notes / changelog artifacts to the GitHub Release.
  - Open a PR to `main` titled like `Changelog for release <version>` — **merge that PR**.

### Pre-release (alpha / rc / trial builds)

- GitHub: check **Set as a pre-release**.
- Tag can be anything you want for the build, for example:
  - `1.0.0-alpha`
  - `v1.2.0-rc.1`
  - `1.1.0-beta.2`
- Workflow will:
  - **Preview** pending Changesets for release notes (it does **not** consume them).
  - Build and push the image.
  - Tag GHCR with **only** that release tag — **not** `:latest`.
  - Not open a changelog cleanup PR.

You can also skip `:latest` without the pre-release checkbox if the tag itself is not plain `X.Y.Z` (for example `1.0.0-alpha`). Prefer checking **Set as a pre-release** anyway so changelog consumption stays off.

### GHCR tag matrix

| Release | Example tag | GHCR tags |
|---------|-------------|-----------|
| Full stable | `1.2.0` | `1.2.0` **and** `latest` |
| Pre-release or suffix tag | `1.0.0-alpha` | `1.0.0-alpha` only |
| Pre-release checkbox on | any tag | that tag only (no `latest`) |

Image name: `ghcr.io/<org>/ado-preflight-ui` (org lowercased from the GitHub repo).

---

## Version alignment

For a **full** release, the GitHub Release tag (without a leading `v`) must equal the version Changesets will write into `package.json`.

Example:

- `package.json` is `1.0.1`
- Pending Changesets include a `minor` bump  
- Next version is `1.1.0`  
- Publish the release with tag `1.1.0` or `v1.1.0`

If they do not match, the **Apply changesets** step fails with an error telling you to retag or adjust bump types.

Pre-releases do not bump `package.json`, so this check does not apply.

To see what is pending locally (after `npm install`):

```bash
npx changeset status
```

---

## Step-by-step: create a pre-release

Use this to publish a trial image without moving `:latest` or consuming Changesets.

1. Ensure the commit you want is on GitHub (usually `main`).
2. In the GitHub repo, open **Releases** → **Draft a new release**.
3. Click **Choose a tag** → type a new tag such as `1.0.0-alpha` → create the tag on the target commit/branch.
4. Set the release title (often the same as the tag).
5. Check **Set as a pre-release**.
6. Leave notes empty or draft; the workflow can replace them with a Changesets preview.
7. Click **Publish release**.
8. Open the **Actions** tab → **Release Container** run for that tag.
9. In the job log, confirm **Set image tags** prints only your tag (no `latest`).
10. Pull / deploy with:

    ```bash
    podman pull ghcr.io/<org>/ado-preflight-ui:1.0.0-alpha
    ```

11. Optional: download the `ado-preflight-ui-<tag>-linux-amd64.tar.gz` asset from the release page.

Pending `.changeset/` files stay in the repo for the eventual full release.

---

## Step-by-step: create a full (stable) release

1. Confirm pending Changesets on `main` and compute the next version (see [Version alignment](#version-alignment)).
2. **Releases** → **Draft a new release**.
3. Create/select tag `X.Y.Z` or `vX.Y.Z` that matches that next version.
4. Target the correct commit (usually latest `main`).
5. **Do not** check “Set as a pre-release”.
6. Publish the release.
7. Watch **Actions** → **Release Container**:
   - Apply changesets succeeds (versions match).
   - **Set image tags** lists both `X.Y.Z` and `latest`.
   - Image push and release asset upload succeed.
   - A notice includes the changelog PR URL (or says none was needed).
8. Open the auto-opened PR (**Changelog for release X.Y.Z**).
9. Review the diff:
   - `CHANGELOG.md` updated
   - `package.json` version bumped
   - Consumed `.changeset/*.md` files removed
10. Merge the PR into `main`.
11. Deploy with:

    ```bash
    podman pull ghcr.io/<org>/ado-preflight-ui:latest
    # or
    podman pull ghcr.io/<org>/ado-preflight-ui:X.Y.Z
    ```

---

## After the release: checklist

- [ ] Release Container workflow is green.
- [ ] GHCR tags match expectations (`latest` only for stable full releases).
- [ ] For full releases, changelog PR is merged so `main` is not left with stale Changesets.
- [ ] Image runs in your environment (smoke the UI).

---

## If something goes wrong

### Apply changesets: tag does not match bump

Retag to the version Changesets expects, or change bump types in `.changeset/*.md`, then publish again (or delete the bad release/tag and recreate).

### Changelog PR was not opened

Use **Actions** → **Open changelog PR** → **Run workflow**, and pass the release tag (for example `v1.1.0`). That re-runs apply + PR creation.

### Pre-release accidentally moved `latest`

That should not happen if the release was marked pre-release or the tag had a suffix like `-alpha`. If `latest` was updated incorrectly, publish a correct stable full release (or manually re-tag the previous good image as `latest` in GHCR).

### CI fails on push/PR with actionlint

CI runs actionlint on every push and pull request. That only validates workflow YAML; it does not publish images. Fix the reported workflow issue and push again.

---

## Related files

| Path | Role |
|------|------|
| [`.github/workflows/release-container.yml`](../.github/workflows/release-container.yml) | Release build, GHCR tags, changelog PR |
| [`.github/workflows/open-changelog-pr.yml`](../.github/workflows/open-changelog-pr.yml) | Manual changelog PR recovery |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Push/PR validation (build, smoke, actionlint) |
| [`.changeset/`](../.changeset/) | Pending release notes fragments |
| [`CHANGELOG.md`](../CHANGELOG.md) | Compiled history (updated on full release) |
| [`package.json`](../package.json) | Current version |
