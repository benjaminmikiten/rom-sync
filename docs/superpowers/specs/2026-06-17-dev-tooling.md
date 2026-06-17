# Dev Tooling — Design Spec
_Date: 2026-06-17_

## Overview

A reusable dev-tooling configuration for TypeScript + React + Electron projects (or any TypeScript project on GitHub). Establishes conventional commits, automated semantic versioning with CHANGELOG generation, pre-commit lint enforcement, and a two-workflow GitHub Actions CI/CD setup.

This spec records every design decision and its rationale so the full setup can be reproduced on a new project in one session.

---

## Design Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Branching strategy | Trunk-based (feature branches → squash PR → `main`) | Low overhead for solo/small teams; no release branch coordination needed |
| Merge style | Squash only | PR title becomes the commit on `main`, keeping conventional commit history clean for semantic-release |
| Commit format | Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) | Machine-readable by semantic-release; enforced by commitlint |
| Release automation | semantic-release | Fully automated on push to `main` — analyzes commits, bumps version, writes CHANGELOG, creates git tag and GitHub Release |
| Pre-commit lint | ESLint via lint-staged (staged files only) | Fast; only lints what you're committing |
| ESLint ruleset | `@typescript-eslint/recommended-type-checked` + `react-hooks` | Type-checked rules catch real bugs beyond what `tsc` alone finds; react-hooks catches missing deps and hook violations |
| Prettier | No | Formatting fights the editor for solo projects; ESLint type rules provide the meaningful signal |
| CI trigger | On every PR and push to `main` | Required status check on PRs; ensures `main` is never broken |
| Release trigger | On push to `main` (after CI) | Every merged PR that contains a releasable commit produces a release automatically |
| PAT / token | None — `GITHUB_TOKEN` with `contents: write` | No long-lived secrets needed for personal repos |
| Branch protection | Ruleset — require `lint-and-test` to pass | Status check is the real quality gate |
| PR enforcement | Convention only (not enforced in ruleset) | GitHub's Actions bot cannot bypass PR requirements in personal-account rulesets; org repos can add the bypass |
| Initial version | `v0.1.0` tagged manually before first release | Semantic-release uses the latest tag as baseline; explicit tag = deterministic starting point |

---

## Version Bump Rules

semantic-release reads commit messages since the last tag:

| Commit type | Version bump | Example |
|---|---|---|
| `fix:` | Patch (0.1.0 → 0.1.1) | `fix: correct path separator on Windows` |
| `feat:` | Minor (0.1.0 → 0.2.0) | `feat: add dark mode` |
| `feat!:` or `BREAKING CHANGE:` in footer | Major (0.1.0 → 1.0.0) | `feat!: remove legacy sync API` |
| `chore:`, `docs:`, `ci:`, `test:`, `refactor:` | No release | `chore: update dependencies` |

---

## Tech Stack

| Concern | Package | Version |
|---|---|---|
| ESLint | `eslint` | 10.x |
| TypeScript ESLint | `typescript-eslint` | 8.x |
| React hooks lint | `eslint-plugin-react-hooks` | 7.x |
| Git hooks | `husky` | 9.x |
| Staged-file lint | `lint-staged` | latest |
| Commit format | `@commitlint/cli`, `@commitlint/config-conventional` | latest |
| Release automation | `semantic-release` | 24.x |
| Release plugins | `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/changelog`, `@semantic-release/npm`, `@semantic-release/git`, `@semantic-release/github` | latest |

---

## Configuration Files

### `eslint.config.mjs`

For Electron projects with a `main` (Node) and `renderer` (React/browser) split. Uses ESLint 9 flat config format.

```js
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**'],
  },
  // Main process, preload, and shared types — Node environment
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Renderer — browser + React environment
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: tseslint.configs.recommendedTypeChecked,
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.web.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)
```

**Non-Electron projects:** Use a single config block with `files: ['src/**/*.{ts,tsx}']` and one tsconfig.

**Gotcha — `react-hooks/set-state-in-effect` (v7 rule):** Calling `setState` directly in a `useEffect` body is flagged, even indirectly via an async function call (`void loadData()`). The fix is to call `.then(setState)` from within the effect — the state setter must be in a callback, not the effect body itself.

### `commitlint.config.mjs`

```js
export default {
  extends: ['@commitlint/config-conventional'],
}
```

### `.husky/pre-commit`

```sh
npx lint-staged
```

### `.husky/commit-msg`

```sh
npx --no -- commitlint --edit $1
```

### `package.json` additions

```json
{
  "scripts": {
    "lint": "eslint ."
  },
  "lint-staged": {
    "*.{ts,tsx}": "eslint --max-warnings 0"
  }
}
```

Husky's `init` command adds `"prepare": "husky"` automatically.

### `.releaserc.json`

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    ["@semantic-release/npm", { "npmPublish": false }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", "package.json"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    "@semantic-release/github"
  ]
}
```

**`npmPublish: false`** — Required for apps that don't publish to the npm registry (Electron apps, private packages). Remove or set to `true` for public npm packages.

**`[skip ci]`** — Critical. Prevents the release commit from triggering another CI run (infinite loop).

**Plugin order matters.** `@semantic-release/npm` must run before `@semantic-release/git` so the version is bumped in `package.json` before it's committed.

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm test
```

**Job name `lint-and-test` must match the string used in the branch ruleset's `required_status_checks`.** Changing the job name breaks the branch protection.

### `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Release
        run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**`fetch-depth: 0`** — Required. semantic-release reads full git history to find the previous tag. Shallow clones break it silently or produce wrong versions.

**`permissions: contents: write`** — Required for the Actions bot to push the release commit and create tags.

### `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug Report
about: Something isn't working correctly
title: 'fix: '
labels: bug
assignees: ''
---

## What happened?

## Steps to reproduce

1. 
2. 
3. 

## Expected behavior

## Actual behavior

## Environment

- macOS version:
- App version (from git tag):
- Device / context:
```

### `.github/ISSUE_TEMPLATE/feature_request.md`

```markdown
---
name: Feature Request
about: Propose a new feature or improvement
title: 'feat: '
labels: enhancement
assignees: ''
---

## Problem statement

## Proposed solution

## Acceptance criteria

- [ ] 
- [ ] 
- [ ] 

## Out of scope

## Alternatives considered
```

### `.github/pull_request_template.md`

```markdown
## Summary

Closes #<!-- issue number -->

## How to test

1. 
2. 
3. 

## Checklist

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Screenshots attached (if this changes any UI)
- [ ] PR title follows conventional commit format (`feat:`, `fix:`, `chore:`, etc.)
```

---

## GitHub Settings (via `gh` CLI)

Run once after pushing the initial commit.

### Squash-only merges

```bash
gh api repos/{owner}/{repo} \
  --method PATCH \
  --field allow_squash_merge=true \
  --field allow_merge_commit=false \
  --field allow_rebase_merge=false \
  --field squash_merge_commit_title=PR_TITLE \
  --field squash_merge_commit_message=BLANK
```

`squash_merge_commit_title=PR_TITLE` makes the PR title the commit message on `main`, which feeds into semantic-release's commit analysis.

### Branch ruleset — require CI to pass

```bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input - <<'EOF'
{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          { "context": "lint-and-test" }
        ],
        "strict_required_status_checks_policy": false
      }
    }
  ]
}
EOF
```

**Gotcha — PR enforcement on personal accounts:** GitHub's API does not allow the Actions bot (`github-actions[bot]`, app ID 15368) as a bypass actor in repository-level rulesets on personal accounts. The `Integration` bypass actor type only works for organization rulesets. Options if PR enforcement is needed:

1. **Move to a GitHub organization** — org rulesets support `actor_type: "Integration", actor_id: 15368` as a bypass actor
2. **Use a PAT** — a Personal Access Token stored as a repo secret (`GH_TOKEN`), passed to semantic-release instead of `GITHUB_TOKEN`; the PAT authenticates as the repo owner (admin) and can bypass PR requirements
3. **Convention-based enforcement** — rely on the squash-only setting and team discipline; the status check still gates quality

### Initial version tag

Tag HEAD before the first release workflow fires:

```bash
git tag -a v0.1.0 -m "chore(release): 0.1.0"
git push origin v0.1.0
```

semantic-release uses the most recent tag as the baseline. Without this, it analyzes all commits from the beginning of history and may produce an unexpected version.

---

## `tsconfig.node.json` adjustment

The `src/shared/` directory (shared types between main and renderer) must be added to `tsconfig.node.json`'s `include` so ESLint can type-check it against the node config:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

---

## First-Run Setup Order

1. `git rm -r --cached out/ .DS_Store` + commit (remove tracked build artifacts)
2. Install ESLint packages + create `eslint.config.mjs` + add `lint` script
3. Fix all ESLint errors in existing codebase (`npm run lint` must exit 0)
4. Install Husky + lint-staged + commitlint + init husky
5. Install semantic-release + plugins + create `.releaserc.json`
6. Create `.github/workflows/ci.yml` and `release.yml`
7. Create `.github/ISSUE_TEMPLATE/` and `pull_request_template.md`
8. `git push origin main`
9. `git tag -a v0.1.0 -m "chore(release): 0.1.0" && git push origin v0.1.0`
10. Run `gh api` commands to configure squash-merge and branch ruleset

**Order matters:** ESLint must be clean before Husky is installed (or the pre-commit hook will block all subsequent commits). Tag must be pushed before the first release workflow fires.
