---
name: github-actions-workflow-setup
description: >
  Create, update, or modernize GitHub Actions workflows for any repository. Invoke this skill whenever
  a user wants to set up CI/CD with GitHub Actions, add or fix a workflow, modernize outdated workflow
  files, create release or deploy pipelines, add linting or testing workflows, set up matrix builds,
  configure reusable workflows, or any request like "set up GitHub Actions", "add CI to my repo",
  "fix my workflow", "modernize my CI/CD", "add a publish workflow", "create a deploy pipeline",
  "set up automated testing in GitHub Actions", or "add security scanning to my workflows". This skill
  focuses exclusively on `.github/workflows/` files and closely related workflow configuration.
---

# GitHub Actions Workflow Setup

Create, update, or modernize GitHub Actions workflows in a safe, incremental, and idempotent way.
This skill works on both empty and existing repositories. It never assumes a blank slate — it
inspects what exists, preserves what works, and changes only what needs changing.

Read `references/action-catalog.md` for current action versions and setup patterns.
Read `references/workflow-patterns.md` for best practices and structural patterns.
Read `references/stack-recipes.md` for per-stack job templates and commands.

---

## Scope

This skill is strictly limited to GitHub Actions workflow configuration:

**In scope:**
- `.github/workflows/*.yml` files
- Workflow-adjacent files only when directly required (e.g., `.github/dependabot.yml` for
  action version updates, environment or secret references in workflow files)

**Out of scope — do not touch:**
- Source code, test code, documentation, README files
- Package manager config (`pyproject.toml`, `package.json`, etc.)
- General project setup, linting config, editor config
- Git hooks, pre-commit config
- Anything outside `.github/workflows/` unless the user explicitly requests it

If the user's request crosses into out-of-scope territory, complete the workflow portion and
note what else they may want to configure separately.

---

## Phase 1 — Gather Requirements

The caller provides workflow requirements. Collect the following — ask for anything missing:

### 1.1 Project Context

| Input | Description | Example |
|---|---|---|
| `project_type` | What kind of project | `python-library`, `node-api`, `go-cli`, `rust-lib`, `docker-app` |
| `stack` | Language, framework, package manager | `python/uv`, `node/pnpm`, `go 1.22`, `rust stable` |
| `source_layout` | Where source code lives | `src/`, `lib/`, `cmd/`, root |

### 1.2 Workflow Categories

Ask which workflow categories to set up. Supported categories:

| Category | Purpose | Typical triggers |
|---|---|---|
| `ci` | Combined lint + test + typecheck | push, pull_request |
| `lint` | Code linting and formatting checks | push, pull_request |
| `test` | Run test suite, optionally with matrix | push, pull_request |
| `typecheck` | Static type checking | push, pull_request |
| `build` | Build artifacts (binaries, Docker images, wheels) | push to main, tags |
| `release` | Create releases, generate changelogs | tag push, manual |
| `publish` | Publish to registries (PyPI, npm, Docker Hub) | release created, manual |
| `deploy` | Deploy to environments (staging, production) | release, workflow_dispatch |
| `security` | Dependency scanning, SAST, secret scanning | schedule, push |
| `maintenance` | Dependency updates, stale issue cleanup | schedule |

The user may request a single combined `ci` workflow or separate `lint`/`test`/`typecheck`
workflows. Respect their preference. When unspecified, prefer separate workflows for clarity
unless the project is small (fewer than 3 jobs total), in which case a single `ci.yml` is fine.

### 1.3 Workflow Preferences

| Input | Description | Default |
|---|---|---|
| `triggers` | Events and branch filters | `push: [main], pull_request: [main], workflow_dispatch` |
| `runners` | GitHub-hosted or self-hosted | `ubuntu-latest` |
| `matrix` | Matrix strategy (versions, OS) | Single version unless specified |
| `commands` | Exact commands to run per step | Inferred from stack if not given |
| `secrets` | Required secrets or environment vars | None |
| `environments` | GitHub environments for deploy/publish | None |
| `workflow_style` | `standalone` or `reusable` | `standalone` |
| `concurrency` | Cancel in-progress runs on same ref | `true` |

### 1.4 Quick-start Shorthand

If the user says something brief like "add CI for my Python project", infer sensible defaults
from the project context rather than asking 15 questions. Summarize your plan and confirm
before generating — one confirmation round, not an interrogation.

---

## Phase 2 — Inspect Existing State

Before creating or modifying anything, audit the current workflow setup:

1. **List existing workflows** — read all `.github/workflows/*.yml` files
2. **Parse each workflow** — extract: name, triggers, jobs, actions used, action versions
3. **Identify patterns** — note the setup actions used (e.g., `setup-python`, `setup-node`),
   package manager patterns, caching strategy, matrix configuration
4. **Detect issues** — flag outdated action versions, deprecated patterns, missing best practices,
   redundant jobs, or conflicting triggers
5. **Check for reusable workflows** — identify any `workflow_call` triggers or `uses:` references
   to `.github/workflows/` paths

Build a mental model of the current state before proposing changes. This inspection informs
every decision in the next phases.

---

## Phase 3 — Plan Changes

Based on requirements and current state, determine what to do with each workflow file.
Every file gets exactly one disposition:

| Disposition | When to use |
|---|---|
| **create** | No existing workflow covers this category |
| **update** | Existing workflow covers the category but needs changes (outdated actions, missing steps, wrong triggers) |
| **modernize** | Existing workflow is functionally correct but uses deprecated patterns or old action versions |
| **merge** | Two or more existing workflows overlap and should be consolidated |
| **split** | An existing workflow is too large and should be broken into focused files |
| **preserve** | Existing workflow is correct and matches requirements — leave untouched |
| **skip** | Category was not requested or is not relevant to this project |

### Decision Rules

1. **Never delete a workflow file** unless merging it into another and the user confirms.
2. **Preserve custom steps** — if an existing workflow has steps beyond standard CI (e.g., custom
   notifications, artifact uploads, deployment hooks), keep them even when updating the workflow.
3. **Preserve valid triggers** — if the user hasn't specified triggers and the existing ones are
   reasonable, keep them.
4. **Modernize action versions** — always update to the latest stable major version. See
   `references/action-catalog.md` for current versions.
5. **Prefer explicit over magic** — use specific action versions (`@v6`) not `@latest` or `@main`.
6. **Consolidate vs. separate** — when the user requests both `lint` and `test` and no existing
   workflows cover them, ask whether they want separate files or a combined `ci.yml`. Default to
   the user's stated `workflow_style` preference.
7. **Reusable workflows** — only create reusable workflows (`workflow_call`) when the user
   explicitly requests them or when there is clear duplication across multiple workflows.

### Present the Plan

Before generating any files, present the plan as a concise summary:

> **Workflow plan:**
> - `ci.yml` — **create** (lint + test + typecheck, triggers: push/PR to main)
> - `publish.yml` — **update** (upgrade actions/checkout to v6, add OIDC publishing)
> - `release.yml` — **preserve** (already up to date)
>
> Proceed?

Only generate after confirmation (or if the user said "just do it").

---

## Phase 4 — Generate Workflows

For each workflow file with a create/update/modernize/merge/split disposition, generate the
YAML content following these structural rules.

### 4.1 File Structure

Every workflow file follows this structure:

```yaml
name: <Descriptive Name>

on:
  <triggers>

permissions:
  contents: read   # always set minimum permissions

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true   # unless deploy/release workflow

jobs:
  <job-name>:
    name: <Human-readable name>
    runs-on: <runner>
    steps:
      - uses: actions/checkout@v6
      # ... remaining steps
```

### 4.2 Structural Rules

1. **Always set `permissions`** — use least privilege. Only escalate when needed (e.g.,
   `id-token: write` for OIDC publishing, `contents: write` for releases).
2. **Always set `concurrency`** — cancel in-progress runs for CI workflows. For deploy/release
   workflows, use `cancel-in-progress: false` to avoid interrupting active deployments.
3. **Always pin action versions** to major tags (`@v6`, `@v7`). See `references/action-catalog.md`.
4. **Always use `actions/checkout`** as the first step.
5. **Use `fetch-depth: 0`** when the workflow needs git history (version computation from tags,
   changelog generation, etc.). Otherwise omit it (defaults to shallow clone, which is faster).
6. **Enable caching** for package managers when available (e.g., `setup-uv` has built-in cache,
   `setup-node` supports `cache: 'npm'`).
7. **Use matrix strategy** only when there's a real reason (multiple Python/Node versions,
   cross-platform builds). Don't add matrices for a single version.
8. **Set `fail-fast: false`** on matrix strategies so all combinations run even if one fails.
9. **Keep job names descriptive** — include the variable dimension in matrix jobs
   (e.g., `Test (Python ${{ matrix.python-version }})`).

### 4.3 Stack-Specific Generation

Read `references/stack-recipes.md` for the exact setup steps, install commands, and test commands
for each stack. The recipes cover:

- Python (uv, pip, poetry, pdm, hatch)
- Node.js (npm, pnpm, yarn, bun)
- Go
- Rust
- Docker
- Multi-language projects

Use the recipe that matches the user's `stack` input. Adapt commands based on what the user
provided — if they gave explicit commands, use those instead of the recipe defaults.

### 4.4 Workflow Category Templates

**lint** — check code formatting and linting rules:
```yaml
jobs:
  lint:
    name: Lint & Format
    runs-on: <runner>
    steps:
      - uses: actions/checkout@v6
      - # stack-specific setup
      - # install dependencies
      - # run linter
      - # run formatter check (--check / --verify)
```

**test** — run test suite with optional matrix:
```yaml
jobs:
  test:
    name: Test (<matrix dimension>)
    runs-on: <runner>
    strategy:
      fail-fast: false
      matrix:
        <dimension>: [<values>]
    steps:
      - uses: actions/checkout@v6
      - # stack-specific setup with matrix variable
      - # install dependencies
      - # run tests with coverage
```

**typecheck** — static type checking:
```yaml
jobs:
  typecheck:
    name: Type Check
    runs-on: <runner>
    steps:
      - uses: actions/checkout@v6
      - # stack-specific setup
      - # install dependencies
      - # run type checker
```

**build** — build artifacts:
```yaml
jobs:
  build:
    name: Build
    runs-on: <runner>
    steps:
      - uses: actions/checkout@v6
      - # stack-specific setup
      - # install dependencies
      - # build command
      - uses: actions/upload-artifact@v4  # if artifacts should be saved
        with:
          name: <artifact-name>
          path: <build-output-path>
```

**publish** — publish to a registry:
```yaml
permissions:
  id-token: write    # for OIDC / trusted publishing
  contents: read

jobs:
  publish:
    name: Publish
    runs-on: <runner>
    environment:
      name: <environment>
      url: <registry-url>
    steps:
      - uses: actions/checkout@v6
      - # stack-specific setup
      - # build
      - # publish (prefer OIDC over stored tokens)
```

**deploy** — deploy to an environment:
```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false   # never cancel active deployments

jobs:
  deploy:
    name: Deploy to <environment>
    runs-on: <runner>
    environment:
      name: <environment>
      url: <deploy-url>
    steps:
      - uses: actions/checkout@v6
      - # build or download artifact
      - # deploy command
```

**security** — dependency and code scanning:
```yaml
on:
  schedule:
    - cron: '0 6 * * 1'   # weekly on Monday
  push:
    branches: [main]

jobs:
  security:
    name: Security Scan
    runs-on: <runner>
    steps:
      - uses: actions/checkout@v6
      - # dependency audit command
      - # optional: CodeQL or other SAST
```

**maintenance** — automated housekeeping:
```yaml
on:
  schedule:
    - cron: '0 6 * * 1'   # weekly

jobs:
  stale:
    name: Close Stale Issues
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - uses: actions/stale@v9
        with:
          stale-issue-message: >
            This issue has been automatically marked as stale because it has not
            had recent activity. It will be closed if no further activity occurs.
          days-before-stale: 60
          days-before-close: 7
```

**release** — create GitHub releases:
```yaml
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - # optional: generate changelog
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

These are starting templates. Adapt each one based on the user's specific requirements,
commands, secrets, and environment configuration.

---

## Phase 5 — Update Strategy for Existing Files

When updating or modernizing an existing workflow file, follow these rules to avoid breaking
things:

### 5.1 Preserve-First Approach

1. **Read the entire existing file** before making any changes.
2. **Identify custom content** — any steps, jobs, environment variables, or configuration that
   goes beyond standard CI/CD patterns. These are often project-specific and must be preserved.
3. **Identify standard content** — setup steps, checkout, install, lint, test, build steps that
   follow common patterns. These can be updated.

### 5.2 What to Update

- Action versions → always update to latest stable (see `references/action-catalog.md`)
- Deprecated action inputs → replace with current equivalents
- Missing `permissions` block → add with least privilege
- Missing `concurrency` block → add (unless the user doesn't want it)
- Runner images → update if using deprecated images (e.g., `ubuntu-18.04` → `ubuntu-latest`)

### 5.3 What to Preserve

- Custom job names and step names
- Custom environment variables and secrets references
- Non-standard steps (notifications, artifact handling, custom scripts)
- Trigger configuration (unless the user specifically asked to change it)
- Job dependencies (`needs:`) and conditional execution (`if:`)
- Comments that explain project-specific decisions

### 5.4 Idempotency

Running this skill twice with the same inputs on the same repository must produce the same
result. Concretely:

- If a workflow already matches the requirements, disposition is **preserve** — no file writes.
- If a workflow was just created by this skill, running again produces no changes.
- The skill never appends duplicate jobs, steps, or triggers.
- The skill never creates a second file for a category that already has a matching workflow.

---

## Phase 6 — Validation Checklist

After generating all workflow files, verify each one:

- [ ] Valid YAML syntax (no tabs for indentation, proper quoting of expressions)
- [ ] `name:` field is present and descriptive
- [ ] `on:` triggers match the user's requirements
- [ ] `permissions:` block is present with least-privilege settings
- [ ] `concurrency:` block is present (with appropriate `cancel-in-progress` setting)
- [ ] All actions are pinned to a major version tag (not `@latest` or `@main`)
- [ ] All action versions are current (see `references/action-catalog.md`)
- [ ] `actions/checkout@v6` is the first step in every job
- [ ] `fetch-depth: 0` is present only when git history is needed
- [ ] Caching is enabled for the package manager where available
- [ ] Matrix strategy uses `fail-fast: false` (if matrix is present)
- [ ] Environment and secret references match what the user specified
- [ ] No duplicate workflows covering the same category
- [ ] No conflicting triggers between workflows
- [ ] Custom content from existing workflows is preserved
- [ ] `${{ }}` expressions are properly quoted in YAML (wrapped in quotes when starting a value)

---

## Phase 7 — Report and Next Steps

After all files are written, present a structured summary:

### Change Report

For each workflow file, report its disposition and what changed:

```
Workflow changes:
  created   .github/workflows/ci.yml         — lint + test + typecheck for Python/uv
  updated   .github/workflows/publish.yml     — upgraded actions to v4, added OIDC permissions
  preserved .github/workflows/release.yml     — already up to date
  skipped   deploy                            — not requested
```

### Secrets and Environment Setup

If any workflows reference secrets or environments, list what the user needs to configure:

```
Required setup:
  - GitHub environment "pypi" with PyPI trusted publisher configured
  - Secret DEPLOY_KEY in repository settings (used by deploy.yml)
```

> **Dependabot and secrets:** GitHub does not expose repository secrets (`secrets.*`) to
> workflows triggered by Dependabot PRs. Any step that depends on a secret (e.g., Codecov
> token upload) will fail on Dependabot PRs. When generating workflows:
> - Use `fail_ci_if_error: false` on Codecov and similar optional upload steps
> - Never gate CI pass/fail on steps that require secrets unavailable to Dependabot
> - If a secret is strictly required for Dependabot PRs, instruct the user to add it
>   under *Settings → Secrets → Dependabot secrets* separately

### Next Steps

Tell the user what to do after the workflows are in place:

1. Push the branch and verify workflows trigger correctly
2. Configure any required secrets or environments listed above
3. Check the Actions tab for the first run results
4. (If applicable) Set up branch protection rules to require workflow checks

---

## Important Rules

- **Never modify source code, test code, or non-workflow configuration files.**
- **Never delete existing workflow files** without explicit user confirmation.
- **Always inspect before generating** — understand the current state first.
- **Always present a plan and confirm** before writing files.
- **Always use current action versions** from `references/action-catalog.md`.
- **Always set `permissions`** — never rely on the repository default.
- **Prefer simplicity** — don't add complexity (reusable workflows, composite actions) unless
  the user specifically needs it or there is clear duplication to eliminate.
- **Quote `${{ }}` expressions** — YAML treats `{` as a flow mapping indicator; always wrap
  expressions in quotes when they start a value.
- **Use `>-` or `|` for multi-line strings** in step commands to keep YAML readable.
