#!/usr/bin/env node
/**
 * generate-coverage.mjs
 *
 * Runs at CI time (daily cron + deploy). Collects test coverage data from
 * the Codecov API for all eligible repositories owned by a GitHub user,
 * computes the arithmetic mean, and writes a static JSON artifact consumed
 * by the Astro build — zero runtime API calls in production.
 *
 *   src/data/coverage-summary.json  — average coverage + per-repo breakdown
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 * Codecov API (v2) → this script → average calculation → JSON file → Astro build
 *
 * Why not query from the browser?
 *   1. Security: the CODECOV_TOKEN must never be shipped to the client.
 *   2. Performance: one static JSON file vs. N API calls per visitor.
 *   3. Reliability: the site renders even if Codecov is down.
 *   4. Cost: no per-visitor API quota consumption.
 *
 * ── Codecov API endpoint used ─────────────────────────────────────────────────
 *
 * GET https://api.codecov.io/api/v2/github/{owner}/repos
 *   - Returns paginated list of repos the owner has in Codecov.
 *   - Each repo object includes `totals.coverage` for the default branch.
 *   - This is the most stable endpoint: a single paginated call gives us
 *     both the repo list and coverage in one shot, avoiding per-repo calls.
 *   - Pagination via `?page=N&page_size=100`.
 *
 * Environment variables
 * ─────────────────────
 *   CODECOV_TOKEN      Codecov API token (required). Create one at
 *                      https://app.codecov.io/account → Access tokens.
 *   GITHUB_OWNER       GitHub username or org (default: ThiagoPanini).
 *   INCLUDE_PRIVATE    Include private repos (default: false).
 *   EXCLUDED_REPOS     Comma-separated repo names to exclude.
 *   INCLUDED_REPOS     Comma-separated repo names to force-include
 *                      (overrides EXCLUDED_REPOS for those repos).
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Config ────────────────────────────────────────────────────────────────────

const GITHUB_OWNER    = process.env.GITHUB_OWNER ?? 'ThiagoPanini';
const CODECOV_TOKEN   = process.env.CODECOV_TOKEN ?? '';
const INCLUDE_PRIVATE = (process.env.INCLUDE_PRIVATE ?? 'false').toLowerCase() === 'true';
const EXCLUDED_REPOS  = parseList(process.env.EXCLUDED_REPOS);
const INCLUDED_REPOS  = parseList(process.env.INCLUDED_REPOS);

const OUTPUT_PATH = new URL('../src/data/coverage-summary.json', import.meta.url);

const CODECOV_API_BASE = 'https://api.codecov.io/api/v2';
const PAGE_SIZE        = 100;
const MAX_PAGES        = 20;      // safety cap
const MAX_RETRIES      = 3;
const RETRY_DELAY_MS   = 2000;
const REQUEST_TIMEOUT  = 15_000;  // 15 seconds per request
const MIN_VALID_REPOS  = 1;       // minimum repos with coverage to consider the run valid

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a comma-separated env var into a trimmed, lowercased Set. */
function parseList(raw) {
  if (!raw) return new Set();
  return new Set(
    raw.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Fetch with retries, timeout, and rate-limit backoff.
 * Returns the parsed JSON body or throws on exhausted retries.
 */
async function fetchWithRetry(url, headers, attempt = 1) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);

    // Rate-limited — back off and retry
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
      const waitMs = Math.max(retryAfter * 1000, RETRY_DELAY_MS);
      if (attempt <= MAX_RETRIES) {
        console.warn(`  ⏳ Rate-limited (429). Retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES})…`);
        await sleep(waitMs);
        return fetchWithRetry(url, headers, attempt + 1);
      }
      throw new Error(`Rate-limited after ${MAX_RETRIES} retries`);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return res.json();
  } catch (err) {
    if (attempt <= MAX_RETRIES && err.name !== 'AbortError') {
      const waitMs = RETRY_DELAY_MS * attempt;
      console.warn(`  ⚠️  Request failed (${err.message}). Retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES})…`);
      await sleep(waitMs);
      return fetchWithRetry(url, headers, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Codecov API ───────────────────────────────────────────────────────────────

const codecovHeaders = {
  Accept: 'application/json',
  ...(CODECOV_TOKEN ? { Authorization: `Bearer ${CODECOV_TOKEN}` } : {}),
};

/**
 * Fetches all repos for the owner from Codecov, handling pagination.
 * Returns the raw array of repo objects from the API.
 */
async function fetchAllCodecovRepos() {
  const allRepos = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = `${CODECOV_API_BASE}/github/${GITHUB_OWNER}/repos?page=${page}&page_size=${PAGE_SIZE}&active=true`;
    console.log(`  📄 Fetching Codecov repos page ${page}…`);

    const data = await fetchWithRetry(url, codecovHeaders);
    const results = data?.results ?? [];
    allRepos.push(...results);

    // Codecov paginates with `next` field (URL or null)
    if (!data?.next || results.length < PAGE_SIZE) break;
    page++;
  }

  return allRepos;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RepoClassification
 * @property {Array} included  — repos that will contribute to the average
 * @property {Array} excluded  — repos filtered out by rules
 * @property {Array} ignored   — repos with no coverage data available
 */

/**
 * Classifies Codecov repos into included / excluded / ignored buckets.
 */
function classifyRepos(repos) {
  const included = [];
  const excluded = [];
  const ignored  = [];

  for (const repo of repos) {
    const name      = repo.name ?? '';
    const nameLower = name.toLowerCase();
    const isPrivate = repo.private ?? false;
    const isFork    = repo.fork ?? false;

    // Force-include list takes priority
    const forceIncluded = INCLUDED_REPOS.has(nameLower);

    // Exclusion checks (skipped when force-included)
    if (!forceIncluded) {
      if (isFork) {
        excluded.push({ name, reason: 'fork' });
        continue;
      }
      if (isPrivate && !INCLUDE_PRIVATE) {
        excluded.push({ name, reason: 'private (INCLUDE_PRIVATE=false)' });
        continue;
      }
      if (EXCLUDED_REPOS.has(nameLower)) {
        excluded.push({ name, reason: 'explicit exclude list' });
        continue;
      }
    }

    // Coverage availability check
    const coverage = repo.totals?.coverage;
    if (coverage == null || typeof coverage !== 'number' || isNaN(coverage)) {
      ignored.push({ name, reason: 'no coverage data available' });
      continue;
    }

    included.push({
      name,
      coverage: Math.round(coverage * 100) / 100,   // 2 decimal places
      branch: repo.branch ?? 'default',
      updatedAt: repo.updatedAt ?? repo.latest_commit_at ?? null,
    });
  }

  return { included, excluded, ignored };
}

// ── Average calculation ───────────────────────────────────────────────────────

/**
 * Simple arithmetic mean of coverage percentages.
 * Returns 0 if no repos are eligible.
 */
function calculateAverage(repos) {
  if (repos.length === 0) return 0;
  const sum = repos.reduce((acc, r) => acc + r.coverage, 0);
  return Math.round((sum / repos.length) * 100) / 100;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

/**
 * Attempts to read the existing output file and return it as a fallback
 * when the API is completely unreachable.
 */
function loadFallback() {
  try {
    const raw = readFileSync(fileURLToPath(OUTPUT_PATH), 'utf-8');
    const existing = JSON.parse(raw);
    existing._fallback = true;
    existing._fallbackReason = 'API unreachable — reusing previous data';
    console.warn('  ⚠️  Using cached fallback from previous run.');
    return existing;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[generate-coverage] Starting coverage collection…');
  console.log(`  Owner:           ${GITHUB_OWNER}`);
  console.log(`  Include private: ${INCLUDE_PRIVATE}`);
  console.log(`  Excluded repos:  ${EXCLUDED_REPOS.size > 0 ? [...EXCLUDED_REPOS].join(', ') : '(none)'}`);
  console.log(`  Included repos:  ${INCLUDED_REPOS.size > 0 ? [...INCLUDED_REPOS].join(', ') : '(none)'}`);
  console.log(`  Token provided:  ${CODECOV_TOKEN ? 'yes' : '⚠️  NO — API calls may fail or be limited'}`);
  console.log();

  let rawRepos;
  try {
    rawRepos = await fetchAllCodecovRepos();
  } catch (err) {
    console.error(`❌  Failed to fetch repos from Codecov: ${err.message}`);
    const fallback = loadFallback();
    if (fallback) {
      writeSummary(fallback);
      process.exit(0);
    }
    // Write an empty but valid JSON so the build doesn't break
    writeSummary(buildEmptyResult('API unreachable and no fallback available'));
    process.exit(0);
  }

  console.log(`  📊 Total repos from Codecov: ${rawRepos.length}`);
  const { included, excluded, ignored } = classifyRepos(rawRepos);

  // Log details
  console.log();
  console.log(`  ✅ Included: ${included.length} repo(s)`);
  for (const r of included) {
    console.log(`     • ${r.name}: ${r.coverage}%`);
  }

  if (excluded.length > 0) {
    console.log(`  🚫 Excluded: ${excluded.length} repo(s)`);
    for (const r of excluded) {
      console.log(`     • ${r.name} — ${r.reason}`);
    }
  }

  if (ignored.length > 0) {
    console.log(`  ⚠️  Ignored: ${ignored.length} repo(s)`);
    for (const r of ignored) {
      console.log(`     • ${r.name} — ${r.reason}`);
    }
  }

  // Validate minimum threshold
  if (included.length < MIN_VALID_REPOS) {
    console.warn(`\n  ⚠️  Only ${included.length} repo(s) with coverage (minimum: ${MIN_VALID_REPOS}).`);
    const fallback = loadFallback();
    if (fallback) {
      writeSummary(fallback);
      process.exit(0);
    }
  }

  const averageCoverage = calculateAverage(included);
  console.log(`\n  📈 Average coverage: ${averageCoverage}% across ${included.length} repo(s)`);

  const summary = {
    metric: 'average_test_coverage',
    owner: GITHUB_OWNER,
    generatedAt: new Date().toISOString(),
    repoCount: included.length,
    includedRepos: included.map((r) => ({
      name: r.name,
      coverage: r.coverage,
      branch: r.branch,
    })),
    excludedRepos: excluded.map((r) => ({
      name: r.name,
      reason: r.reason,
    })),
    ignoredRepos: ignored.map((r) => ({
      name: r.name,
      reason: r.reason,
    })),
    averageCoverage,
    unit: 'percent',
  };

  writeSummary(summary);
  console.log('\n✅  Coverage summary written successfully.');
  process.exit(0);
}

/** Builds an empty-but-valid result for total failure scenarios. */
function buildEmptyResult(reason) {
  return {
    metric: 'average_test_coverage',
    owner: GITHUB_OWNER,
    generatedAt: new Date().toISOString(),
    repoCount: 0,
    includedRepos: [],
    excludedRepos: [],
    ignoredRepos: [],
    averageCoverage: 0,
    unit: 'percent',
    _fallback: true,
    _fallbackReason: reason,
  };
}

/** Writes the JSON summary to disk. */
function writeSummary(data) {
  const outPath = fileURLToPath(OUTPUT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`❌  Unexpected error: ${err.message}`);
  const fallback = loadFallback();
  if (fallback) {
    writeSummary(fallback);
  } else {
    writeSummary(buildEmptyResult(`Unexpected error: ${err.message}`));
  }
  process.exit(0);
});
