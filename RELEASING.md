# Release process

Releases are built, tested and published by GitHub Actions
(`.github/workflows/release.yml`). Locally you only bump the version, update the
changelog, commit and push a tag.

---

## Prerequisites

- Node.js ≥ 22 and Yarn 4.18 via Corepack (`corepack enable`; the version is
  pinned in `package.json` → `packageManager`).
- Push access to `main`.
- One-time: the npm Trusted Publisher for this repo (see [One-time setup](#one-time-setup-npm-trusted-publisher)).
  No npm token or `npm login` is needed locally.

---

## 1. Review what changed

```bash
git status --short
git diff HEAD
```

Go through each modified file and confirm the changes are intentional and complete.

---

## 2. Decide the version bump

Follow [Semantic Versioning](https://semver.org):

| Change type | Version bump | Example |
|---|---|---|
| Bug fix only | patch | `0.3.0` → `0.3.1` |
| New backwards-compatible feature | minor | `0.3.0` → `0.4.0` |
| Breaking API change | major | `0.3.0` → `1.0.0` |

---

## 3. Update `package.json`

Edit the `version` field:

```json
"version": "0.X.Y"
```

The release workflow fails if the pushed tag does not match this version.

---

## 4. Update `CHANGELOG.md`

Add a new section at the top (after the `---` divider) following the existing format:

```md
## [0.X.Y] — YYYY-MM-DD

### Added
- …

### Fixed
- …

### Changed
- …

### Breaking
- …

[0.X.Y]: https://github.com/thebylito/exjs-controllers/compare/v0.PREV...v0.X.Y
```

The release workflow extracts this section as the GitHub Release notes
(`.github/scripts/release-notes.sh`) and fails before publishing if it is missing.

---

## 5. Verify locally

```bash
yarn install
yarn clean && yarn build
yarn test
```

CI runs the same steps on Node 22 and 24 for every push and pull request.

---

## 6. Commit

Stage every changed file (source + `package.json` + `CHANGELOG.md` + `yarn.lock`):

```bash
git add .
git status --short   # confirm everything is staged
git commit -m "chore(release): 0.X.Y

- <brief bullet for each change>"
```

---

## 7. Tag and push

```bash
git tag v0.X.Y
git push origin main --tags
```

Pushing the tag triggers the release workflow.

---

## 8. Watch the release

```bash
gh run watch
```

or open the **Actions** tab on GitHub. The workflow:

1. Checks that the tag matches `package.json` `version`.
2. Extracts the CHANGELOG section for the version (fails if absent).
3. Runs `yarn install --immutable`, `yarn build`, `yarn test`.
4. Publishes to npm with provenance via Trusted Publishing (OIDC).
5. Creates the GitHub Release `v0.X.Y` with the changelog notes and the `.tgz` tarball attached.

Expected result: `npm view exjs-controllers version` prints the new version and
the release appears under **Releases** on GitHub.

---

## If the release fails

- **Before "Publish to npm"** (tag mismatch, missing changelog, failing tests):
  nothing was published. Fix the problem, then move the tag:

  ```bash
  git tag -d v0.X.Y
  git push origin :refs/tags/v0.X.Y
  git tag v0.X.Y
  git push origin main --tags
  ```

- **After "Publish to npm"** (e.g. the GitHub Release step failed): the npm
  version is already out and cannot be republished. Create the GitHub Release by
  hand with `gh release create v0.X.Y --notes-file <(.github/scripts/release-notes.sh 0.X.Y)`,
  or ship a patch release if the package itself is broken
  (`npm deprecate exjs-controllers@0.X.Y "<reason>"` for the bad one).

---

## One-time setup: npm Trusted Publisher

Done once per package; lets the workflow publish without any token.

1. On npmjs.com open the `exjs-controllers` package → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Fill in (case-sensitive, exact):
   - Organization or user: `thebylito`
   - Repository: `exjs-controllers`
   - Workflow filename: `release.yml`
   - Environment name: leave blank
3. Save. The first tagged release confirms it works.
4. Optional, after that first release: in the package's publishing access settings
   choose the option that disallows tokens, so only the workflow can publish.

---

## Manual fallback

If GitHub Actions is unavailable, the old path still works:

```bash
yarn install && yarn clean && yarn build && yarn test
npm login
npm publish
```

---

## Checklist

```
[ ] All source changes reviewed
[ ] version bumped in package.json
[ ] CHANGELOG.md updated (new section + comparison link)
[ ] README.md updated if public API changed
[ ] yarn clean && yarn build && yarn test pass locally
[ ] git commit with descriptive message
[ ] git tag v0.X.Y created and pushed (git push origin main --tags)
[ ] Release workflow green; npm version and GitHub Release visible
```
