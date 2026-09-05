# Release process

Step-by-step guide to publish a new version of `exjs-controllers` to npm.

---

## Prerequisites

- Node.js ≥ 22.
- Yarn 4.18 via Corepack (`corepack enable`; the version is pinned in `package.json` → `packageManager`).
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

Add the comparison link right after the section:

```md
[0.X.Y]: https://github.com/thebylito/exjs-controllers/compare/v0.PREV...v0.X.Y
```

---

## 6. Build and test

```bash
yarn install
yarn clean && yarn build
yarn test
```

No output from `yarn build` means success. If there are TypeScript errors, fix them before continuing.

> `npm publish` also runs `prepack` (`clean` + `build`), so `dist/` is always rebuilt from the current source at publish time.

---

## 7. Commit

Stage every changed file (source + `package.json` + `CHANGELOG.md` + `yarn.lock`):

```bash
git add .
git status --short   # confirm everything is staged
```

```bash
git commit -m "chore(release): 0.X.Y

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

```bash
npm publish
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
[ ] yarn clean && yarn build && yarn test pass
[ ] git commit with descriptive message
[ ] git tag v0.X.Y created
[ ] npm publish succeeded (+ exjs-controllers@0.X.Y)
[ ] git push origin main --tags
```
