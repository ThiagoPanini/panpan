# Workflow Patterns and Best Practices

Structural patterns, anti-patterns, and best practices for GitHub Actions workflows.

---

## Table of Contents

- [Trigger Patterns](#trigger-patterns)
- [Permission Patterns](#permission-patterns)
- [Concurrency Patterns](#concurrency-patterns)
- [Job Structure Patterns](#job-structure-patterns)
- [Matrix Patterns](#matrix-patterns)
- [Caching Patterns](#caching-patterns)
- [Secret and Environment Patterns](#secret-and-environment-patterns)
- [Reusable Workflow Patterns](#reusable-workflow-patterns)
- [Anti-Patterns](#anti-patterns)

---

## Trigger Patterns

### Standard CI triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
```

### CI with release branches

```yaml
on:
  push:
    branches: [main, 'v*']          # main + version branches (v1.x, v2.0)
  pull_request:
    branches: [main, 'v*']
  workflow_dispatch:
```

### Tag-triggered release

```yaml
on:
  push:
    tags: ['v*']                     # v1.0.0, v2.3.1-beta
```

### Release event (for publishing)

```yaml
on:
  release:
    types: [created]                 # or [published] for drafts
```

### Scheduled workflows

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'             # every Monday at 06:00 UTC
```

> Scheduled workflows run on the default branch only. If the workflow file doesn't exist
> on the default branch, it won't run.

### Path filters

Use path filters to avoid running workflows when unrelated files change:

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'tests/**'
      - 'pyproject.toml'
      - '.github/workflows/ci.yml'
  pull_request:
    paths:
      - 'src/**'
      - 'tests/**'
      - 'pyproject.toml'
      - '.github/workflows/ci.yml'
```

> Be cautious with path filters — they can cause required checks to never report a status on
> PRs that don't touch the listed paths. If the workflow is a required status check, use
> `paths-ignore` instead or handle the missing status with a fallback workflow.

### Manual with inputs

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        type: choice
        options: [staging, production]
      dry_run:
        description: 'Dry run (no actual deploy)'
        required: false
        type: boolean
        default: false
```

---

## Permission Patterns

Always set explicit permissions. The default `write-all` is too broad for most workflows.

### Read-only (most CI workflows)

```yaml
permissions:
  contents: read
```

### Publishing with OIDC

```yaml
permissions:
  id-token: write
  contents: read
```

### Release creation

```yaml
permissions:
  contents: write
```

### Issue/PR management

```yaml
permissions:
  issues: write
  pull-requests: write
```

### Per-job permissions

When different jobs need different permissions, set them at the job level:

```yaml
permissions:
  contents: read           # workflow-level default

jobs:
  test:
    runs-on: ubuntu-latest
    # inherits contents: read
    steps: [...]

  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write      # job-level override
    steps: [...]
```

---

## Concurrency Patterns

### Standard CI (cancel previous runs)

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

This cancels in-progress runs when a new push to the same branch arrives. Ideal for CI
workflows where only the latest commit matters.

### Deployment (never cancel)

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
```

Deployments should never be cancelled mid-flight. Queue instead.

### Per-environment deployment

```yaml
concurrency:
  group: deploy-${{ inputs.environment }}
  cancel-in-progress: false
```

---

## Job Structure Patterns

### Job dependencies

Use `needs:` to create a pipeline:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]

  test:
    runs-on: ubuntu-latest
    steps: [...]

  build:
    needs: [lint, test]          # runs after both lint and test pass
    runs-on: ubuntu-latest
    steps: [...]

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps: [...]
```

### Conditional jobs

```yaml
jobs:
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps: [...]
```

### Passing data between jobs

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.value }}
    steps:
      - id: version
        run: echo "value=$(cat VERSION)" >> "$GITHUB_OUTPUT"

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo "Publishing version ${{ needs.build.outputs.version }}"
```

### Passing artifacts between jobs

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: <build-command>
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - run: <publish-command>
```

---

## Matrix Patterns

### Single dimension

```yaml
strategy:
  fail-fast: false
  matrix:
    python-version: ['3.11', '3.12', '3.13']
```

### Multi-dimension

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    python-version: ['3.11', '3.12']
```

### Include/exclude

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest]
    python-version: ['3.11', '3.12']
    exclude:
      - os: macos-latest
        python-version: '3.11'
    include:
      - os: ubuntu-latest
        python-version: '3.13'
        experimental: true
```

### Using matrix values

```yaml
jobs:
  test:
    name: "Test (Python ${{ matrix.python-version }}, ${{ matrix.os }})"
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        python-version: ['3.11', '3.12']
        os: [ubuntu-latest]
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
```

---

## Caching Patterns

### Prefer built-in caching

Most setup actions now support built-in caching. Prefer this over manual `actions/cache`:

```yaml
# Python with pip
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'
    cache: 'pip'

# Python with uv
- uses: astral-sh/setup-uv@v7
  with:
    enable-cache: true

# Node with npm
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'

# Go
- uses: actions/setup-go@v5
  with:
    go-version: '1.23'
    cache: true
```

### Manual caching (when built-in is not available)

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.cargo/bin/
      ~/.cargo/registry/index/
      ~/.cargo/registry/cache/
      target/
    key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: |
      ${{ runner.os }}-cargo-
```

---

## Secret and Environment Patterns

### Using secrets

```yaml
steps:
  - run: deploy --token "$TOKEN"
    env:
      TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

> Never pass secrets directly in command arguments — use environment variables.

### GitHub environments

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://example.com
    steps: [...]
```

Environments support:
- Required reviewers (manual approval gate)
- Wait timers
- Deployment branches (restrict which branches can deploy)
- Environment-scoped secrets

### Environment-based deployment pipeline

```yaml
jobs:
  deploy-staging:
    environment: staging
    runs-on: ubuntu-latest
    steps: [...]

  deploy-production:
    needs: deploy-staging
    environment: production
    runs-on: ubuntu-latest
    steps: [...]
```

---

## Reusable Workflow Patterns

### Defining a reusable workflow

```yaml
# .github/workflows/reusable-test.yml
name: Reusable Test

on:
  workflow_call:
    inputs:
      python-version:
        required: true
        type: string
    secrets:
      codecov-token:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ inputs.python-version }}
      - run: pip install -e ".[dev]"
      - run: pytest
```

### Calling a reusable workflow

```yaml
jobs:
  test:
    uses: ./.github/workflows/reusable-test.yml
    with:
      python-version: '3.12'
    secrets:
      codecov-token: ${{ secrets.CODECOV_TOKEN }}
```

### When to use reusable workflows

Use reusable workflows when:
- Multiple repositories share the same CI pattern (org-wide workflows)
- Multiple workflows in the same repo duplicate significant logic
- The user explicitly requests them

Do NOT use reusable workflows when:
- There's only one consumer
- The workflow is simple enough that duplication isn't a maintenance burden
- The user hasn't requested them

---

## Anti-Patterns

### Do not use `@latest` or `@main` for actions

```yaml
# BAD
- uses: actions/checkout@latest
- uses: actions/checkout@main

# GOOD
- uses: actions/checkout@v6
```

### Do not use `set-output` (deprecated)

```yaml
# BAD (deprecated since Oct 2022)
- run: echo "::set-output name=version::1.0.0"

# GOOD
- run: echo "version=1.0.0" >> "$GITHUB_OUTPUT"
```

### Do not use `save-state` (deprecated)

```yaml
# BAD
- run: echo "::save-state name=key::value"

# GOOD
- run: echo "key=value" >> "$GITHUB_STATE"
```

### Do not hardcode secrets in workflow files

```yaml
# BAD
- run: curl -H "Authorization: token ghp_xxxx" https://api.github.com

# GOOD
- run: curl -H "Authorization: token $TOKEN" https://api.github.com
  env:
    TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Do not run without permissions block

```yaml
# BAD — inherits repository default (often write-all)
on: push
jobs:
  test:
    runs-on: ubuntu-latest

# GOOD — explicit least privilege
on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
```

### Do not use `fail-fast: true` (default) with matrices

```yaml
# BAD — one failure cancels all other matrix jobs
strategy:
  matrix:
    python-version: ['3.11', '3.12', '3.13']

# GOOD — all matrix jobs run to completion
strategy:
  fail-fast: false
  matrix:
    python-version: ['3.11', '3.12', '3.13']
```

### Do not install tools already available on runners

GitHub-hosted runners come with many tools pre-installed. Check the runner images documentation
before adding installation steps for common tools like `git`, `curl`, `jq`, `docker`, etc.
