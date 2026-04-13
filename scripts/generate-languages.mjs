#!/usr/bin/env node
/**
 * generate-languages.mjs
 *
 * Runs at CI time (daily cron + deploy). Queries GitHub repository language
 * data from the top REPO_COUNT most recently pushed repositories, excludes
 * the primary stack (Python, Terraform) and configurable noise languages,
 * aggregates language percentages, normalizes to 100%, and writes a static
 * JSON artifact consumed by the Astro build — zero runtime API calls in
 * production.
 *
 *   src/data/language-expansion.json  — top technologies beyond the primary stack
 *
 * Repository selection
 * ────────────────────
 * Repositories are fetched sorted by most recent push date (descending).
 * Only the first REPO_COUNT non-fork, non-archived repos are used, ensuring
 * the output reflects current hands-on development activity.
 *
 * Aggregation strategy
 * ────────────────────
 * For each selected repository:
 *   1. Fetch /repos/{owner}/{repo}/languages (returns byte counts per language).
 *   2. Compute that repository's total byte count.
 *   3. Express each language as a percentage of that total.
 *   4. Exclude languages listed in EXCLUDED_LANGUAGES.
 *   5. Accumulate each language's percentages in a running map.
 *
 * After processing all repositories, rank languages by their accumulated score
 * descending and take the top TOP_N results. Scores are then normalized to
 * sum to 100%, giving a "weighted language share" percentage across the
 * selected repositories. If fewer than MIN_REQUIRED non-excluded technologies
 * are found, all available results are emitted with a warning.
 *
 * Environment variables
 * ─────────────────────
 *   GH_TOKEN         GitHub token (GITHUB_TOKEN in Actions). Increases rate limits.
 *   GITHUB_USERNAME  GitHub login to query (default: ThiagoPanini).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname }                  from 'node:path';
import { fileURLToPath }            from 'node:url';

// ── Config ────────────────────────────────────────────────────────────────────

const GITHUB_USERNAME = process.env.GITHUB_USERNAME ?? 'ThiagoPanini';
const GH_TOKEN        = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';

/** Technologies that define the pre-AI primary stack (shown in UI as "Before AI"). */
const PRIMARY_STACK = ['Python', 'Terraform'];

/**
 * Configurable list of unwanted technologies to filter from the output.
 * These are languages that add noise rather than signal — they don't represent
 * meaningful technology adoption (e.g. notebook formats, documentation markup,
 * or Terraform's underlying syntax which is already covered by Terraform itself).
 */
const EXCLUDE_LIST = ['Jupyter Notebook', 'Markdown', 'HCL'];

/** Combined exclusion set: primary stack + noise filters. */
const EXCLUDED_LANGUAGES = new Set([...PRIMARY_STACK, ...EXCLUDE_LIST]);

/** Number of most recently pushed repositories to analyze. */
const REPO_COUNT = 5;

/** Maximum number of top languages to include in the output. */
const TOP_N = 5;

/** Minimum number of technologies expected. Emits a warning when not met. */
const MIN_REQUIRED = 5;

const OUTPUT_PATH = new URL('../src/data/language-expansion.json', import.meta.url);

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const ghHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
};

/**
 * Makes an authenticated GET request to the GitHub REST API.
 * Returns null on 404 so callers can skip missing resources.
 * Throws on any other non-OK status so failures surface clearly.
 */
async function ghGet(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: ghHeaders });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

// ── Repository list ───────────────────────────────────────────────────────────

/**
 * Returns the top REPO_COUNT non-fork, non-archived public repositories owned
 * by GITHUB_USERNAME, sorted by most recent push date (descending). This
 * ensures the output reflects current hands-on development activity.
 */
async function fetchTopRepos() {
  const repos = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await ghGet(
      `/users/${GITHUB_USERNAME}/repos?type=owner&sort=pushed&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch.filter((r) => !r.fork && !r.archived));
    if (repos.length >= REPO_COUNT) break;
    if (batch.length < 100) break;  // last page reached
  }
  return repos.slice(0, REPO_COUNT);
}

// ── Language aggregation ──────────────────────────────────────────────────────

/**
 * Fetches the byte-count language breakdown for a single repository.
 * Returns null on failure so the parent Promise.all can skip it gracefully.
 */
async function fetchRepoLanguages(repoName) {
  try {
    const data = await ghGet(`/repos/${GITHUB_USERNAME}/${repoName}/languages`);
    // GitHub returns an object {LanguageName: bytes} or null/array on error
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch (err) {
    console.warn(`  [skip] ${repoName}: ${err.message}`);
    return null;
  }
}

/**
 * Aggregates per-repo language percentages across all repositories.
 *
 * For each repo the score contribution = (bytes / repoTotal) * 100.
 * Scores across repos are summed into a global accumulator and then ranked.
 * This approach is:
 *   - Deterministic: same input always produces the same ranking.
 *   - Proportional: larger repos with heavy use of a language score higher.
 *   - Normalized per repo: a one-language repo doesn't dominate a varied one.
 *
 * @param {Array} repos - Non-fork, non-archived repo objects from the GitHub API.
 * @returns {Promise<Array<{name: string, score: number}>>} Ranked language list.
 */
async function aggregateLanguages(repos) {
  const scores = new Map();  // language name → cumulative percentage sum
  let reposProcessed = 0;

  await Promise.all(
    repos.map(async (repo) => {
      const langs = await fetchRepoLanguages(repo.name);
      if (!langs) return;

      const totalBytes = Object.values(langs).reduce((s, b) => s + b, 0);
      if (totalBytes === 0) return;

      for (const [lang, bytes] of Object.entries(langs)) {
        if (EXCLUDED_LANGUAGES.has(lang)) continue;
        const pct = (bytes / totalBytes) * 100;
        scores.set(lang, (scores.get(lang) ?? 0) + pct);
      }
      reposProcessed++;
    }),
  );

  console.log(`  Processed ${reposProcessed} / ${repos.length} repositories.`);

  // Rank descending by accumulated score, take top TOP_N
  const ranked = [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, Math.max(TOP_N, MIN_REQUIRED));

  if (ranked.length < MIN_REQUIRED) {
    console.warn(
      `  Warning: only ${ranked.length} distinct non-excluded technologies found ` +
      `(expected at least ${MIN_REQUIRED}). Outputting what is available.`,
    );
  }

  return ranked.map(([name, score]) => ({
    name,
    score: Math.round(score * 10) / 10,  // round to one decimal place
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  console.log(`[generate-languages] Fetching top ${REPO_COUNT} repositories for ${GITHUB_USERNAME}...`);
  const repos = await fetchTopRepos();
  console.log(`  Selected ${repos.length} repositories:`);
  repos.forEach((r) => console.log(`    • ${r.name} (pushed ${r.pushed_at})`));

  if (repos.length === 0) {
    throw new Error(
      'No repositories returned by GitHub API — check GH_TOKEN and GITHUB_USERNAME.',
    );
  }

  console.log('[generate-languages] Aggregating language data...');
  const topLanguages = await aggregateLanguages(repos);

  // Normalize scores to percentages that sum to 100%
  const totalScore = topLanguages.reduce((sum, l) => sum + l.score, 0);
  const normalized = topLanguages.map((l) => ({
    name: l.name,
    score: l.score,
    percentage: totalScore > 0
      ? Math.round((l.score / totalScore) * 1000) / 10  // one decimal place
      : 0,
  }));

  const output = {
    generatedAt:       new Date().toISOString(),
    metric:            'weighted_language_share',
    metricDescription: `Aggregated language share across the ${repos.length} most recently active repositories, normalized to 100%.`,
    repoCount:         repos.length,
    selectedRepos:     repos.map((r) => r.name),
    primaryStack:      PRIMARY_STACK,
    excludedLanguages: [...EXCLUDED_LANGUAGES],
    topLanguages:      normalized,
  };

  mkdirSync(dirname(fileURLToPath(OUTPUT_PATH)), { recursive: true });
  writeFileSync(fileURLToPath(OUTPUT_PATH), JSON.stringify(output, null, 2) + '\n');

  console.log(`✅  Language expansion written (${normalized.length} technologies):`);
  normalized.forEach(({ name, percentage }) => {
    console.log(`    ${name.padEnd(24)} ${percentage.toFixed(1)}%`);
  });

  process.exit(0);
} catch (err) {
  console.error(`❌  generate-languages failed: ${err.message}`);
  process.exit(1);
}
