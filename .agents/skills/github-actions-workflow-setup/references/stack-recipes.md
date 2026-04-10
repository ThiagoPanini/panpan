# Stack Recipes

Per-stack workflow job templates. Each recipe provides the setup steps, install commands,
and tool-specific commands for a given language and package manager combination.

Use these as starting points. If the user provides explicit commands, prefer those over
the recipe defaults.

---

## Table of Contents

- [Python](#python)
- [Node.js](#nodejs)
- [Go](#go)
- [Rust](#rust)
- [Docker](#docker)
- [Multi-language](#multi-language)

---

## Python

### Python + uv

Setup:
```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0              # only if version tags needed
- uses: astral-sh/setup-uv@v7
  with:
    enable-cache: true
    python-version: ${{ matrix.python-version }}    # or a fixed version
- name: Install dependencies
  run: uv sync
```

Commands:
| Task | Command |
|---|---|
| Lint | `uv run ruff check .` |
| Format check | `uv run ruff format --check .` |
| Type check (mypy) | `uv run mypy src/` |
| Type check (pyright) | `uv run pyright` |
| Test | `uv run pytest` |
| Test with coverage | `uv run pytest --cov=src --cov-report=term-missing` |
| Test with XML report | `uv run pytest --cov=src --cov-report=term-missing --cov-report=xml` |
| Build | `uv build` |

Coverage upload (Codecov) — add after the test step:
```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v5
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    files: coverage.xml
    flags: python-${{ matrix.python-version }}
    fail_ci_if_error: false
```

> Requires `--cov-report=xml` in pytest addopts or the test command. The project's
> `pyproject.toml` / `setup.cfg` must produce `coverage.xml`.
>
> **Dependabot note:** Use `fail_ci_if_error: false` because GitHub does not expose
> repository secrets to Dependabot PRs. With `true`, the Codecov step would break CI
> on every Dependabot PR since `CODECOV_TOKEN` is unavailable.

Matrix dimensions:
```yaml
strategy:
  fail-fast: false
  matrix:
    python-version: ['3.11', '3.12', '3.13']
```

### Python + pip

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-python@v5
  with:
    python-version: ${{ matrix.python-version }}
    cache: 'pip'
- name: Install dependencies
  run: pip install -e ".[dev]"
```

Commands:
| Task | Command |
|---|---|
| Lint | `ruff check .` |
| Format check | `ruff format --check .` |
| Type check (mypy) | `mypy src/` |
| Test | `pytest` |
| Test with coverage | `pytest --cov=src --cov-report=term-missing` |
| Test with XML report | `pytest --cov=src --cov-report=term-missing --cov-report=xml` |
| Build | `python -m build` |

### Python + poetry

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-python@v5
  with:
    python-version: ${{ matrix.python-version }}
- name: Install Poetry
  run: pip install poetry
- name: Install dependencies
  run: poetry install
```

Commands:
| Task | Command |
|---|---|
| Lint | `poetry run ruff check .` |
| Format check | `poetry run ruff format --check .` |
| Type check | `poetry run mypy src/` |
| Test | `poetry run pytest` |
| Test with XML report | `poetry run pytest --cov=src --cov-report=term-missing --cov-report=xml` |
| Build | `poetry build` |

### Python + pdm

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-python@v5
  with:
    python-version: ${{ matrix.python-version }}
- name: Install PDM
  run: pip install pdm
- name: Install dependencies
  run: pdm install
```

Commands:
| Task | Command |
|---|---|
| Lint | `pdm run ruff check .` |
| Format check | `pdm run ruff format --check .` |
| Type check | `pdm run mypy src/` |
| Test | `pdm run pytest` |
| Test with XML report | `pdm run pytest --cov=src --cov-report=term-missing --cov-report=xml` |
| Build | `pdm build` |

### Python + hatch

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-python@v5
  with:
    python-version: ${{ matrix.python-version }}
- name: Install Hatch
  run: pip install hatch
```

Commands:
| Task | Command |
|---|---|
| Lint | `hatch run lint:check` |
| Format check | `hatch run lint:fmt --check` |
| Type check | `hatch run types:check` |
| Test | `hatch run test` |
| Build | `hatch build` |

> Hatch commands depend on the environments defined in `pyproject.toml`. The above assumes
> standard environment names — adjust based on the actual config.

### Python publishing (PyPI via OIDC)

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

For pip-based projects, replace the build step:
```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install build
      - run: python -m build
      - uses: pypa/gh-action-pypi-publish@release/v1
```

### Python security scanning

```yaml
- name: Install bandit
  run: pip install bandit
- name: Run bandit
  run: bandit -r src/ -f json -o bandit-report.json || true
```

Or with uv:
```yaml
- name: Run bandit
  run: uv run bandit -r src/ -f json -o bandit-report.json || true
```

---

## Node.js

### Node.js + npm

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-node@v4
  with:
    node-version: ${{ matrix.node-version }}
    cache: 'npm'
- name: Install dependencies
  run: npm ci
```

Commands:
| Task | Command |
|---|---|
| Lint | `npm run lint` |
| Format check | `npx prettier --check .` |
| Type check | `npx tsc --noEmit` |
| Test | `npm test` |
| Test with coverage | `npm test -- --coverage` |
| Build | `npm run build` |

Matrix dimensions:
```yaml
strategy:
  fail-fast: false
  matrix:
    node-version: ['20', '22']
```

### Node.js + pnpm

Setup:
```yaml
- uses: actions/checkout@v6
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v4
  with:
    node-version: ${{ matrix.node-version }}
    cache: 'pnpm'
- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

Commands:
| Task | Command |
|---|---|
| Lint | `pnpm run lint` |
| Format check | `pnpm exec prettier --check .` |
| Type check | `pnpm exec tsc --noEmit` |
| Test | `pnpm test` |
| Build | `pnpm run build` |

### Node.js + yarn (v4 / Berry)

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-node@v4
  with:
    node-version: ${{ matrix.node-version }}
    cache: 'yarn'
- name: Install dependencies
  run: yarn install --immutable
```

Commands:
| Task | Command |
|---|---|
| Lint | `yarn lint` |
| Type check | `yarn tsc --noEmit` |
| Test | `yarn test` |
| Build | `yarn build` |

### Node.js + bun

Setup:
```yaml
- uses: actions/checkout@v6
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: latest
- name: Install dependencies
  run: bun install --frozen-lockfile
```

Commands:
| Task | Command |
|---|---|
| Lint | `bun run lint` |
| Type check | `bun run tsc --noEmit` |
| Test | `bun test` |
| Build | `bun run build` |

### npm publishing

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

---

## Go

### Go (standard)

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions/setup-go@v5
  with:
    go-version: ${{ matrix.go-version }}
    cache: true
```

Commands:
| Task | Command |
|---|---|
| Lint | `go vet ./...` |
| Lint (golangci-lint) | `golangci-lint run` |
| Format check | `test -z "$(gofmt -l .)"` |
| Test | `go test ./...` |
| Test with coverage | `go test -coverprofile=coverage.out ./...` |
| Build | `go build ./...` |

Matrix dimensions:
```yaml
strategy:
  fail-fast: false
  matrix:
    go-version: ['1.22', '1.23']
```

### Go with golangci-lint

```yaml
- uses: golangci/golangci-lint-action@v6
  with:
    version: latest
```

### Go binary release (goreleaser)

```yaml
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-go@v5
        with:
          go-version: stable
      - uses: goreleaser/goreleaser-action@v6
        with:
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Rust

### Rust (standard)

Setup:
```yaml
- uses: actions/checkout@v6
- uses: actions-rust-lang/setup-rust-toolchain@v1
  with:
    toolchain: stable
    components: clippy, rustfmt
```

Commands:
| Task | Command |
|---|---|
| Lint | `cargo clippy -- -D warnings` |
| Format check | `cargo fmt --check` |
| Test | `cargo test` |
| Build | `cargo build --release` |

Matrix dimensions:
```yaml
strategy:
  fail-fast: false
  matrix:
    toolchain: [stable, beta]
    os: [ubuntu-latest, macos-latest, windows-latest]
```

### Rust binary release

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - target: x86_64-unknown-linux-gnu
            os: ubuntu-latest
          - target: x86_64-apple-darwin
            os: macos-latest
          - target: x86_64-pc-windows-msvc
            os: windows-latest
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          toolchain: stable
          target: ${{ matrix.target }}
      - run: cargo build --release --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: binary-${{ matrix.target }}
          path: target/${{ matrix.target }}/release/<binary-name>*
```

---

## Docker

### Docker build and push (GHCR)

```yaml
permissions:
  contents: read
  packages: write

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

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
            type=semver,pattern={{major}}.{{minor}}
            type=sha

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Docker build and push (Docker Hub)

Replace the login step:
```yaml
- uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}
```

And the images in metadata:
```yaml
images: ${{ secrets.DOCKERHUB_USERNAME }}/<image-name>
```

---

## Multi-language

For repositories with multiple languages (e.g., Python backend + Node.js frontend), create
separate jobs within the same workflow or separate workflow files:

### Separate jobs (same workflow)

```yaml
jobs:
  backend:
    name: Backend (Python)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: astral-sh/setup-uv@v7
        with:
          enable-cache: true
      - run: uv sync
      - run: uv run pytest

  frontend:
    name: Frontend (Node.js)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm test
```

### Separate workflows

For larger projects, separate workflows give clearer status reporting and independent
trigger control. Use path filters to only run relevant workflows:

```yaml
# .github/workflows/backend.yml
on:
  push:
    paths: ['backend/**', 'shared/**']

# .github/workflows/frontend.yml
on:
  push:
    paths: ['frontend/**', 'shared/**']
```
