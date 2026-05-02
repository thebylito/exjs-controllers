# Release process

Step-by-step guide to publish a new version of `exjs-controllers` to npm.

---

## Prerequisites

- Node.js ≥ 20 and Yarn Berry installed.
- npm account with publish access to the `exjs-controllers` package.
- Authenticated on npm (see step 1).

---

## 1. Authenticate on npm (first time or when token expired)

```bash
npm login
# Opens a browser tab — approve the login and press ENTER.
npm whoami   # must print "thebylito"
```

---

## 2. Review what changed

```bash
git status --short
git diff HEAD
```

Go through each modified file and confirm the changes are intentional and complete.

---

## 3. Decide the version bump

Follow [Semantic Versioning](https://semver.org):

| Change type | Version bump | Example |
|---|---|---|
| Bug fix only | patch | `0.3.0` → `0.3.1` |
| New backwards-compatible feature | minor | `0.3.0` → `0.4.0` |
| Breaking API change | major | `0.3.0` → `1.0.0` |

---

## 4. Update `package.json`

Edit the `version` field:

```json
"version": "0.X.Y"
```

---

## 5. Update `CHANGELOG.md`

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
```

Add the comparison link at the bottom of the file:

```md
[0.X.Y]: https://github.com/thebylito/exjs-controllers/compare/v0.PREV...v0.X.Y
```

---

## 6. Build

The `prepack` script calls `tsc` without `yarn`, which fails in the Yarn Berry environment. Build manually:

```bash
rm -rf dist
yarn tsc -p tsconfig.json
```

No output means success. If there are TypeScript errors, fix them before continuing.

---

## 7. Commit

Stage every changed file (source + `package.json` + `CHANGELOG.md` + `yarn.lock`):

```bash
git add .
git status --short   # confirm everything is staged
```

```bash
git commit -m "feat: release 0.X.Y

- <brief bullet for each change>"
```

---

## 8. Tag

```bash
git tag v0.X.Y
git log --oneline -3   # confirm the tag appears
```

---

## 9. Publish to npm

> `--ignore-scripts` skips `prepack` (which would try to rebuild via `npm run build` → `tsc`, failing in Yarn Berry). The `dist/` was already built in step 6.

```bash
npm publish --ignore-scripts
```

Expected output ends with:

```
+ exjs-controllers@0.X.Y
```

To preview the tarball without publishing:

```bash
npm run pack:dry-run
# or
npm run publish:dry-run
```

---

## 10. Push to GitHub

```bash
git push origin main --tags
```

---

## Checklist

```
[ ] npm whoami returns the correct user
[ ] All source changes reviewed
[ ] version bumped in package.json
[ ] CHANGELOG.md updated (new section + comparison link)
[ ] README.md updated if public API changed
[ ] dist/ rebuilt with: rm -rf dist && yarn tsc -p tsconfig.json
[ ] git commit with descriptive message
[ ] git tag v0.X.Y created
[ ] npm publish --ignore-scripts succeeded (+ exjs-controllers@0.X.Y)
[ ] git push origin main --tags
```

---

## Known issues

### `tsc: command not found` during `npm publish`

The `prepack` script runs `npm run build` which calls `tsc` directly. In this repo, TypeScript is managed by Yarn Berry and is not on `$PATH` for `npm` scripts. Always use `--ignore-scripts` and build manually first (step 6).

**Future fix:** change the `build` script to `yarn tsc -p tsconfig.json` — this makes `npm run build` work regardless of whether `npm` or `yarn` runs it.
