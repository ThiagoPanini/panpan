# Action Catalog

Current stable versions of commonly used GitHub Actions. Always pin to these major version tags.

Last reviewed: 2026-04

---

## Table of Contents

- [Core Actions](#core-actions)
- [Language Setup](#language-setup)
- [Package Manager Setup](#package-manager-setup)
- [Build and Artifacts](#build-and-artifacts)
- [Publishing](#publishing)
- [Security](#security)
- [Utilities](#utilities)
- [Deprecated Patterns](#deprecated-patterns)

---

## Core Actions

| Action | Version | Purpose |
|---|---|---|
| `actions/checkout` | `v6` | Check out repository code |
| `actions/cache` | `v4` | Cache dependencies and build outputs |
| `actions/upload-artifact` | `v4` | Upload build artifacts |
| `actions/download-artifact` | `v4` | Download build artifacts |

### actions/checkout

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0          # only when git history is needed (version tags, changelog)
    # fetch-depth: 1        # default — shallow clone, faster
```

### actions/cache

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.cache/pip
      ~/.cache/uv
    key: ${{ runner.os }}-<tool>-${{ hashFiles('**/lockfile') }}
    restore-keys: |
      ${{ runner.os }}-<tool>-
```

> Most language setup actions have built-in caching now. Prefer those over manual `actions/cache`
> unless you need fine-grained control.

---

## Language Setup

| Action | Version | Language |
|---|---|---|
| `actions/setup-python` | `v5` | Python |
| `actions/setup-node` | `v4` | Node.js |
| `actions/setup-go` | `v5` | Go |
| `actions-rust-lang/setup-rust-toolchain` | `v1` | Rust |
| `actions/setup-java` | `v4` | Java / Kotlin |
| `actions/setup-dotnet` | `v4` | .NET |

### Python

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.12'
    cache: 'pip'            # or 'pipenv', 'poetry'
```

With matrix:
```yaml
strategy:
  fail-fast: false
  matrix:
    python-version: ['3.11', '3.12', '3.13']
steps:
  - uses: actions/setup-python@v5
    with:
      python-version: ${{ matrix.python-version }}
```

### Node.js

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'            # or 'pnpm', 'yarn'
```

> For pnpm, install it first:
> ```yaml
> - uses: pnpm/action-setup@v4
> - uses: actions/setup-node@v4
>   with:
>     node-version: '22'
>     cache: 'pnpm'
> ```

### Go

```yaml
- uses: actions/setup-go@v5
  with:
    go-version: '1.23'
    cache: true             # built-in module cache
```

### Rust

```yaml
- uses: actions-rust-lang/setup-rust-toolchain@v1
  with:
    toolchain: stable
    components: clippy, rustfmt
    # built-in caching via actions/cache
```

---

## Package Manager Setup

| Action | Version | Package Manager |
|---|---|---|
| `astral-sh/setup-uv` | `v7` | uv (Python) |
| `pnpm/action-setup` | `v4` | pnpm (Node.js) |
| `oven-sh/setup-bun` | `v2` | Bun (JS/TS) |

### uv

```yaml
- uses: astral-sh/setup-uv@v7
  with:
    enable-cache: true
    # python-version: '3.12'  # optional, can also use matrix variable
```

With matrix:
```yaml
- uses: astral-sh/setup-uv@v7
  with:
    enable-cache: true
    python-version: ${{ matrix.python-version }}
```

### pnpm

```yaml
- uses: pnpm/action-setup@v4
  # version is read from packageManager field in package.json
```

### Bun

```yaml
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: latest
```

---

## Build and Artifacts

| Action | Version | Purpose |
|---|---|---|
| `actions/upload-artifact` | `v4` | Upload artifacts from a workflow run |
| `actions/download-artifact` | `v4` | Download artifacts in a downstream job |
| `docker/setup-buildx-action` | `v3` | Set up Docker Buildx |
| `docker/build-push-action` | `v6` | Build and push Docker images |
| `docker/login-action` | `v3` | Log in to container registries |
| `docker/metadata-action` | `v5` | Extract metadata for Docker images |

### Docker build and push

```yaml
- uses: docker/setup-buildx-action@v3

- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- uses: docker/metadata-action@v5
  id: meta
  with:
    images: ghcr.io/${{ github.repository }}
    tags: |
      type=semver,pattern={{version}}
      type=sha

- uses: docker/build-push-action@v6
  with:
    context: .
    push: true
    tags: ${{ steps.meta.outputs.tags }}
    labels: ${{ steps.meta.outputs.labels }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Publishing

| Action | Version | Registry |
|---|---|---|
| `pypa/gh-action-pypi-publish` | `release/v1` | PyPI (Python) |
| `softprops/action-gh-release` | `v2` | GitHub Releases |

### PyPI (Trusted Publishing / OIDC)

```yaml
permissions:
  id-token: write
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    environment:
      name: pypi
      url: https://pypi.org/p/<package-name>
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: astral-sh/setup-uv@v7
      - run: uv build
      - uses: pypa/gh-action-pypi-publish@release/v1
```

### npm

```yaml
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v4
    with:
      node-version: '22'
      registry-url: 'https://registry.npmjs.org'
  - run: npm ci
  - run: npm publish
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### GitHub Releases

```yaml
- uses: softprops/action-gh-release@v2
  with:
    generate_release_notes: true
    files: |
      dist/*
```

---

## Coverage

| Action | Version | Purpose |
|---|---|---|
| `codecov/codecov-action` | `v5` | Upload coverage reports to Codecov |

### Codecov

```yaml
- uses: codecov/codecov-action@v5
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    files: coverage.xml             # explicit path — avoids auto-detection surprises
    flags: <flag-name>              # e.g. python-${{ matrix.python-version }}
    fail_ci_if_error: true          # set false if Codecov outages should not block CI
```

Key inputs:

| Input | Default | Notes |
|---|---|---|
| `token` | — | Required for private repos; recommended for public repos to avoid rate limits |
| `files` | auto-detect | Explicit is better — set to `coverage.xml` (Python), `coverage/lcov.info` (JS), etc. |
| `flags` | — | Tags the upload (useful with matrix builds). Codecov merges flagged uploads automatically |
| `fail_ci_if_error` | `false` | Set `true` for strict CI; set `false` if Codecov availability should not gate merges |
| `name` | — | Human-readable label for the upload (optional) |

> **Dependabot and secrets:** GitHub does not expose repository secrets to workflows triggered
> by Dependabot PRs. If `CODECOV_TOKEN` is only in repository secrets, the Codecov upload will
> fail on Dependabot PRs. To avoid blocking CI:
> - Set `fail_ci_if_error: false` (recommended — tests still run, only the upload is skipped), or
> - Add `CODECOV_TOKEN` to *Settings → Secrets → Dependabot secrets* as well.

Configuration file: place `.github/codecov.yml` or `codecov.yml` at repo root. Example:

```yaml
coverage:
  status:
    project:
      default:
        target: auto
        threshold: 1%
    patch:
      default:
        target: 80%
  ignore:
    - "tests/"
    - "**/__init__.py"

comment:
  layout: "reach,diff,flags,files"
  behavior: default

flag_management:
  default_rules:
    carryforward: true    # carry forward when a matrix flag is missing
```

> **Cross-cutting concern:** Codecov requires an XML (or lcov) report file. This means
> the project's test/coverage config (`pyproject.toml`, `jest.config`, etc.) must include
> `--cov-report=xml` or equivalent. Note this to the user but do not modify those files —
> they are outside this skill's scope.

---

## Security

| Action | Version | Purpose |
|---|---|---|
| `github/codeql-action/init` | `v3` | CodeQL SAST initialization |
| `github/codeql-action/analyze` | `v3` | CodeQL SAST analysis |
| `aquasecurity/trivy-action` | `v0.28.0` | Container and filesystem vulnerability scanning |
| `actions/dependency-review-action` | `v4` | Review dependency changes in PRs |

### CodeQL

```yaml
- uses: github/codeql-action/init@v3
  with:
    languages: python        # or javascript, go, java, etc.
- uses: github/codeql-action/analyze@v3
```

### Dependency review (PR only)

```yaml
on:
  pull_request:

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/dependency-review-action@v4
```

---

## Utilities

| Action | Version | Purpose |
|---|---|---|
| `actions/stale` | `v9` | Close stale issues and PRs |
| `actions/labeler` | `v5` | Auto-label PRs based on paths |
| `peter-evans/create-pull-request` | `v7` | Create PRs programmatically |
| `EndBug/add-and-commit` | `v9` | Commit and push changes |

### Stale issues

```yaml
- uses: actions/stale@v9
  with:
    stale-issue-message: >
      This issue has been automatically marked as stale because it has not
      had recent activity. It will be closed if no further activity occurs.
    days-before-stale: 60
    days-before-close: 7
```

---

## Deprecated Patterns

Avoid these — they are outdated or have better replacements:

| Deprecated | Replacement |
|---|---|
| `actions/checkout@v4` | `actions/checkout@v6` |
| `actions/checkout@v3` | `actions/checkout@v6` |
| `actions/checkout@v2` | `actions/checkout@v6` |
| `actions/setup-python@v4` | `actions/setup-python@v5` |
| `actions/setup-node@v3` | `actions/setup-node@v4` |
| `actions/cache@v3` | `actions/cache@v4` (or built-in caching in setup actions) |
| `actions/upload-artifact@v3` | `actions/upload-artifact@v4` |
| `astral-sh/setup-uv@v5` | `astral-sh/setup-uv@v7` |
| `docker/build-push-action@v5` | `docker/build-push-action@v6` |
| `ubuntu-18.04` runner | `ubuntu-latest` or `ubuntu-24.04` |
| `ubuntu-20.04` runner | `ubuntu-latest` or `ubuntu-24.04` |
| `set-output` command | `$GITHUB_OUTPUT` environment file |
| `save-state` command | `$GITHUB_STATE` environment file |
| `::set-env` command | `$GITHUB_ENV` environment file |
| `actions/create-release` | `softprops/action-gh-release@v2` |
| Manual PyPI token upload | Trusted Publishing (OIDC) via `pypa/gh-action-pypi-publish` |
