# Copilot Instructions — panpan portfolio

Personal portfolio of **Thiago Panini** (Staff Analytics Engineer). Built with **Astro**, deployed to **Vercel**. Zero client-side JavaScript by default; GSAP animations are the only deliberate exception.

## Validating changes

- Run `npm run build` — this is the **only** validation gate. There are no test or lint scripts configured.
- After any edit, confirm the build completes without errors before considering the change done.

## Code conventions

### Components

- Astro components live in `src/components/` as `.astro` files with **PascalCase** names (e.g., `Hero.astro`, `Projects.astro`, `AIStack.astro`, `CoverageCard.astro`).
- Layouts go in `src/layouts/` (e.g., `BaseLayout.astro`).
- Pages go in `src/pages/` (file-based routing).

### CSS

- Vanilla CSS only — **no Tailwind**.
- Stylesheets in `src/styles/` use **kebab-case** filenames.
- Always reuse existing **custom properties** from `src/styles/global.css` as design tokens. Do not hard-code colors, spacing, or font values that already have a token.
- Key tokens: `--color-bg`, `--color-accent`, `--color-text-primary`, `--color-text-secondary`, `--font-display` (Space Grotesk), `--font-body` (Outfit), `--space-xs` through `--space-3xl`.

### TypeScript & client-side JS

- Client-side scripts go in `src/scripts/` as TypeScript (e.g., `animations.ts`, `neuralNetwork.ts`).
- Load scripts with `<script>` tags only when explicitly needed.
- Avoid `client:*` directives unless interactivity is genuinely required. Default to static rendering.
- Do **not** introduce React, Vue, Svelte, or any UI framework.

### Imports

- Use the `@/*` path alias to reference `src/` (e.g., `import X from '@/lib/utils'`).

### Data files

- Files in `src/data/` are **auto-generated** by GitHub Actions (`daily-update.yml`). Never edit them manually.
- Includes: `commit-activity.json`, `coverage-summary.json`, `language-expansion.json`, `recent-repos.json`, `github-digest/latest.json`.

### Automation scripts

- Node.js scripts in the root `scripts/` directory are ES modules (`.mjs`): `generate-digest.mjs`, `generate-coverage.mjs`, `generate-languages.mjs`. They run outside Astro and are not bundled.

### Dependencies

- **astro** — static site generator.
- **gsap** — scroll/entrance animations (only client-side JS).
- **@vercel/analytics** — page-view tracking.
- Do not add new dependencies without explicit justification.

## Code review checklist

When reviewing a PR, verify:

1. `npm run build` passes.
2. No unintentional `client:*` directives were added.
3. New CSS references existing custom properties instead of hard-coded values.
4. New `.astro` components follow PascalCase and are placed in `src/components/`.
5. No manual edits to `src/data/`.
6. No new npm dependencies added without explicit justification.
7. Changes stay scoped to what was requested — no drive-by refactors.
