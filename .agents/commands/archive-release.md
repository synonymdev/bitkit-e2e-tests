---
description: "/archive-release [version] [--attach-only] — Tag e2e at the green staging/migration SHA and attach regtest Android APK + iOS sim builds to that tag"
argument_hint: "[version] [--attach-only] [--android-only] [--ios-only] [--sha <commit>]"
allowed_tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
---

Archive a Bitkit release for E2E: pin `bitkit-e2e-tests` at the revision that went green against `release-{version}` (staging or migration), then attach matching regtest app builds to a GitHub release on that tag.

**When to run:** After the app `release-{version}` branches are cut and staging and/or migration E2E is green. Not part of `/release` on the app repos — run this from `bitkit-e2e-tests` once validation is done.

**Examples:**
- `/archive-release` — Interactive; prompts for version
- `/archive-release 2.5.0` — Full flow for 2.5.0
- `/archive-release 2.5.0 --attach-only` — Tag already exists; build + upload assets only
- `/archive-release 2.5.0 --sha 2856050` — Tag a specific e2e commit
- `/archive-release 2.5.0 --android-only` — Skip iOS (e.g. no Mac)

## Preconditions

Sibling checkouts (same parent dir as this repo, or override with env):

| Repo | Default path | Override |
| --- | --- | --- |
| bitkit-android | `../bitkit-android` | `ANDROID_ROOT` |
| bitkit-ios | `../bitkit-ios` | `IOS_ROOT` |

- `gh` authenticated for `synonymdev/bitkit-e2e-tests`, `bitkit-android`, `bitkit-ios`
- Android SDK/NDK for APK builds
- **macOS + Xcode** for iOS simulator builds (`build-ios-sim.sh`). On Linux, use `--android-only` and upload the iOS zip later from a Mac, or pass a prebuilt `Bitkit.app.zip`

## Tag naming

- Tag / GitHub release name: `{version}` (e.g. `2.5.0`) — **no** `v` prefix (matches `2.5.0`; older tags like `v2.4.0` are legacy)
- App release branches: `release-{version}` on both android and ios

## Steps

### 1. Resolve version

Parse the first non-flag argument as `{version}`.

If missing, use `AskUserQuestion` with header "Version":

**Question:** `"Which release to archive?"`

Offer recent `release-*` branches from android as options (e.g. strip `release-` → `2.5.0`), plus Other for a custom value.

Reject values that are not `X.Y.Z`.

Flags:

| Flag | Effect |
| --- | --- |
| `--attach-only` | Skip creating the git tag; only ensure GH release exists and upload assets |
| `--android-only` | Build/upload APK only |
| `--ios-only` | Build/upload iOS sim zip only |
| `--sha <commit>` | Use this e2e commit instead of discovering from CI |

### 2. Resolve e2e SHA (skip discovery when `--attach-only` and tag exists)

Goal: the commit of `bitkit-e2e-tests` that ran in a **successful** staging or migration job against `release-{version}`.

If `--sha` was passed: use it (must exist on `origin`).

Otherwise discover:

```bash
# Prefer a green migration run on the release branch; fall back to staging.
# Android hosts both workflows today; check ios too if android has none.
gh run list --repo synonymdev/bitkit-android \
  --branch "release-{version}" \
  --workflow e2e_migration.yml \
  --status success --limit 5

gh run list --repo synonymdev/bitkit-android \
  --branch "release-{version}" \
  --workflow e2e-staging.yml \
  --status success --limit 5
```

Pick the newest success the user confirms (or the newest if only one). Extract the e2e checkout SHA from that run’s logs:

```bash
gh run view {run_id} --repo synonymdev/bitkit-android --log 2>/dev/null \
  | rg -m1 -o 'HEAD is now at ([0-9a-f]+)' -r '$1' \
  || true
```

Also accept lines like `Effective ref: main` then resolve `origin/main` **only if** the run is recent enough that main has not moved — prefer the `HEAD is now at` hash from the Clone E2E tests step.

If discovery fails: `AskUserQuestion` for the SHA (or confirm using an existing tag — see step 3).

Store as `{e2eSha}` (full or unambiguous abbreviated).

Record `{ciSource}` = `migration` | `staging` and the run URL for release notes.

### 3. Tag (unless `--attach-only` or tag already correct)

```bash
git fetch origin --tags
```

If tag `{version}` already exists:

```bash
EXISTING=$(git rev-list -n1 "{version}")
```

- If `EXISTING` equals `{e2eSha}` (or `--attach-only`): print `Tag {version} already at {EXISTING} — skipping tag.` and continue to build/upload.
- If it differs from `{e2eSha}`: **stop** and ask. Do not move annotated tags silently. Options: keep existing (`--attach-only` path), or abort so a human can retag.

If tag does not exist:

```bash
git tag -a "{version}" "{e2eSha}" -m "{version}"
git push origin "refs/tags/{version}"
```

Prefer annotated tags (existing `2.5.0` is annotated + signed). Signing is optional; use `git tag -s` only when the operator’s GPG/SSH signing is already configured.

### 4. Check out app release branches

Do **not** dirty the user’s current worktrees if they are on other branches. Prefer disposable worktrees:

```bash
E2E_ROOT="$(pwd)"   # bitkit-e2e-tests
PARENT="$(dirname "$E2E_ROOT")"
AND_WT="$PARENT/.archive-release-android-{version}"
IOS_WT="$PARENT/.archive-release-ios-{version}"

git -C "$PARENT/bitkit-android" fetch origin "release-{version}"
git -C "$PARENT/bitkit-ios" fetch origin "release-{version}"

rm -rf "$AND_WT" "$IOS_WT"
git -C "$PARENT/bitkit-android" worktree add --detach "$AND_WT" "origin/release-{version}"
git -C "$PARENT/bitkit-ios" worktree add --detach "$IOS_WT" "origin/release-{version}"

export ANDROID_ROOT="$AND_WT"
export IOS_ROOT="$IOS_WT"
```

If worktree add fails (missing branch): stop with a clear error — both `release-{version}` branches must exist.

Record tip SHAs:

```bash
AND_SHA=$(git -C "$ANDROID_ROOT" rev-parse HEAD)
IOS_SHA=$(git -C "$IOS_ROOT" rev-parse HEAD)
```

### 5. Build artifacts (`BACKEND=regtest`)

Match staging: network Electrum + Trezor bridge enabled.

**Android** (unless `--ios-only`):

```bash
BACKEND=regtest TREZOR_BRIDGE=true ./scripts/build-android-apk.sh
# → aut/bitkit_e2e.apk
```

**iOS** (unless `--android-only`):

Requires macOS. If not Darwin:

```text
⚠ iOS sim build needs macOS/Xcode — skipping. Re-run with --ios-only on a Mac, or place Bitkit.app.zip under aut/ and upload manually.
```

On macOS:

```bash
BACKEND=regtest TREZOR_BRIDGE=true ./scripts/build-ios-sim.sh
# → aut/Bitkit.app

# Zip for GitHub release upload (keep parent dir name Bitkit.app)
rm -f aut/Bitkit.app.zip
(cd aut && zip -r Bitkit.app.zip Bitkit.app)
```

Verify files exist before upload. Copy to version-stamped names for the release assets (stable download names on the tag URL):

| Local | Release asset |
| --- | --- |
| `aut/bitkit_e2e.apk` | `bitkit_e2e.apk` |
| `aut/Bitkit.app.zip` | `Bitkit.app.zip` |

### 6. Create or update GitHub release + upload

Release notes (write to `.ai/archive-release-{version}.md` then use as `--notes-file`):

```markdown
E2E-validated regtest builds for Bitkit {version}.

- e2e SHA: `{e2eSha}`
- validated by: {ciSource} ([run]({runUrl}))
- android `release-{version}`: `{andSha}`
- ios `release-{version}`: `{iosSha}`
- build: `BACKEND=regtest TREZOR_BRIDGE=true`

Artifacts drop into `aut/` as `bitkit_e2e.apk` and `Bitkit.app` (unzip `Bitkit.app.zip`).
```

If no GitHub release exists for the tag:

```bash
gh release create "{version}" \
  --repo synonymdev/bitkit-e2e-tests \
  --title "{version}" \
  --notes-file ".ai/archive-release-{version}.md" \
  --verify-tag
```

Then upload whatever was built:

```bash
# Android
gh release upload "{version}" \
  --repo synonymdev/bitkit-e2e-tests \
  aut/bitkit_e2e.apk \
  --clobber

# iOS (when present)
gh release upload "{version}" \
  --repo synonymdev/bitkit-e2e-tests \
  aut/Bitkit.app.zip \
  --clobber
```

`--clobber` replaces prior assets on re-runs (e.g. attach-only after a rebuild).

### 7. Cleanup worktrees

```bash
git -C "$PARENT/bitkit-android" worktree remove --force "$AND_WT" || true
git -C "$PARENT/bitkit-ios" worktree remove --force "$IOS_WT" || true
```

Leave `aut/` artifacts in place for local smoke if useful; they are gitignored.

### 8. Summary

Print:

```text
Archive complete: {version}
Tag: https://github.com/synonymdev/bitkit-e2e-tests/releases/tag/{version}
e2e SHA: {e2eSha} ({ciSource})
Android: bitkit_e2e.apk ({uploaded|skipped})
iOS: Bitkit.app.zip ({uploaded|skipped|needs Mac})
```

## This-release note (2.5.0)

Tag `2.5.0` already points at `2856050` — do **not** retag. Run:

```text
/archive-release 2.5.0 --attach-only
```

Build both platforms (Mac for iOS) and upload to the existing tag’s GitHub release (create the release if missing; the annotated tag alone is not a release with assets).

## Non-goals

- Does not bump app versions, cut `release-*` branches, or post Slack (that is app-repo `/release`)
- Does not run the E2E suite — only archives builds after CI already went green
- Does not move an existing tag to a different SHA without explicit human confirmation
