#!/usr/bin/env node
/**
 * generate-digest.mjs
 *
 * Fetches the authenticated user's public GitHub events from yesterday,
 * aggregates them into structured stats, optionally summarises them via
 * the GitHub Models API (LLM), and writes the result to:
 *   src/data/github-digest/latest.json
 *
 * Environment variables
 * ─────────────────────
 *   GH_TOKEN        GitHub token (GITHUB_TOKEN in Actions). Powers the
 *                   /users/{login}/events API and increases rate limits.
 *   MODELS_TOKEN    Optional GitHub PAT with models:read scope.
 *                   When present, generates an LLM-written summary via
 *                   the GitHub Models inference endpoint.
 *                   Falls back to a template summary when absent or on error.
 *   GITHUB_USERNAME GitHub login to query (default: ThiagoPanini).
 *   DATE_OVERRIDE   ISO date (YYYY-MM-DD) to use as "yesterday" target.
 *                   Useful for back-filling or manual workflow_dispatch runs.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname }                  from 'node:path';
import { fileURLToPath }            from 'node:url';

// ── Config ────────────────────────────────────────────────────────────────────

const GITHUB_USERNAME = process.env.GITHUB_USERNAME ?? 'ThiagoPanini';
const GH_TOKEN        = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const MODELS_TOKEN    = process.env.MODELS_TOKEN ?? '';

// Target date: either explicit override or yesterday (UTC)
const targetDate = (() => {
  const override = process.env.DATE_OVERRIDE?.trim();
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
})();

const OUTPUT_PATH = new URL('../src/data/github-digest/latest.json', import.meta.url);

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const ghHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
};

async function ghGet(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: ghHeaders });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status}`);
  return res.json();
}

// ── Event fetching ────────────────────────────────────────────────────────────

/**
 * Fetches up to 300 public events for the user and filters to those
 * whose `created_at` falls within the target calendar date (UTC).
 *
 * GitHub's /events endpoint delivers the 300 most recent events across
 * all repos; for a typical developer this reliably covers one day.
 */
async function fetchYesterdayEvents() {
  const start = new Date(`${targetDate}T00:00:00Z`).getTime();
  const end   = new Date(`${targetDate}T23:59:59Z`).getTime();

  const allEvents = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const page_events = await ghGet(
        `/users/${GITHUB_USERNAME}/events?per_page=100&page=${page}`,
      );
      if (!Array.isArray(page_events) || page_events.length === 0) break;
      allEvents.push(...page_events);
      // Events are newest-first; once we're past the target day, stop paging
      const oldest = new Date(page_events.at(-1)?.created_at ?? 0).getTime();
      if (oldest < start) break;
    } catch (err) {
      console.warn(`Event page ${page} fetch failed: ${err.message}`);
      break;
    }
  }

  return allEvents.filter((e) => {
    const t = new Date(e.created_at ?? 0).getTime();
    return t >= start && t <= end;
  });
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregateEvents(events) {
  const repos = new Set();
  let commits      = 0;
  let pullRequests = 0;
  let issuesClosed = 0;

  for (const e of events) {
    const repoShort = (e.repo?.name ?? '').replace(`${GITHUB_USERNAME}/`, '');
    if (repoShort) repos.add(repoShort);

    switch (e.type) {
      case 'PushEvent':
        commits += e.payload?.commits?.length ?? 0;
        break;
      case 'PullRequestEvent':
        if (e.payload?.action === 'opened' || e.payload?.action === 'merged') pullRequests++;
        break;
      case 'IssuesEvent':
        if (e.payload?.action === 'closed') issuesClosed++;
        break;
    }
  }

  return {
    commits,
    reposTouched: [...repos].slice(0, 10),
    pullRequests,
    issuesClosed,
    eventCount: events.length,
  };
}

// ── LLM summary (GitHub Models) ───────────────────────────────────────────────

/**
 * Calls the GitHub Models inference endpoint with a curated event context to
 * produce a single, developer-voice summary sentence.
 *
 * Requires a PAT with `models:read` scope stored as MODELS_TOKEN secret.
 * Returns null on any failure so the caller can fall back gracefully.
 */
async function generateLLMSummary(events, stats) {
  if (!MODELS_TOKEN) return null;

  // Build a concise event feed for the prompt (avoid sending huge payloads)
  const eventFeed = events
    .slice(0, 25)
    .map((e) => {
      const repo = (e.repo?.name ?? '').replace(`${GITHUB_USERNAME}/`, '');
      switch (e.type) {
        case 'PushEvent': {
          const msgs = (e.payload?.commits ?? [])
            .slice(0, 3)
            .map((c) => c.message?.split('\n')[0])
            .filter(Boolean)
            .join('; ');
          return `push to ${repo}: ${msgs || '(no message)'}`;
        }
        case 'PullRequestEvent':
          return `${e.payload?.action ?? 'action'} PR on ${repo}: ${e.payload?.pull_request?.title ?? ''}`;
        case 'IssuesEvent':
          return `${e.payload?.action ?? 'action'} issue on ${repo}: ${e.payload?.issue?.title ?? ''}`;
        case 'CreateEvent':
          return `created ${e.payload?.ref_type ?? 'ref'} on ${repo}`;
        default:
          return `${e.type} on ${repo}`;
      }
    })
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `You are summarising a developer's GitHub activity for ${targetDate}.`,
    '',
    'Activity log:',
    eventFeed,
    '',
    `Stats: ${stats.commits} commits, ${stats.pullRequests} PRs, across ${stats.reposTouched.join(', ') || 'various repos'}.`,
    '',
    'Write ONE flowing sentence (max 200 characters) capturing what was built or changed.',
    'Use present-tense narrative. Be specific. No quotes, no markdown, no "The developer".',
  ].join('\n');

  try {
    const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MODELS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.65,
      }),
    });
    if (!res.ok) {
      console.warn(`GitHub Models API returned ${res.status} — using template summary.`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text ?? null;
  } catch (err) {
    console.warn(`GitHub Models request failed: ${err.message} — using template summary.`);
    return null;
  }
}

// ── Template summary (fallback) ───────────────────────────────────────────────

function generateTemplateSummary(stats) {
  if (stats.eventCount === 0) {
    return `No recorded GitHub activity on ${targetDate}.`;
  }

  const parts = [];
  if (stats.commits > 0)
    parts.push(`${stats.commits} commit${stats.commits === 1 ? '' : 's'}`);
  if (stats.pullRequests > 0)
    parts.push(`${stats.pullRequests} PR${stats.pullRequests === 1 ? '' : 's'}`);
  if (stats.issuesClosed > 0)
    parts.push(`${stats.issuesClosed} issue${stats.issuesClosed === 1 ? '' : 's'} closed`);

  const repoList = stats.reposTouched.slice(0, 3).join(', ');
  const activityStr = parts.length > 0 ? parts.join(', ') : 'Activity recorded';
  return `${activityStr} across ${repoList || 'multiple repos'}.`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  console.log(`Generating digest for ${targetDate}...`);

  const events     = await fetchYesterdayEvents();
  const stats      = aggregateEvents(events);
  const llmSummary = await generateLLMSummary(events, stats);
  const summary    = llmSummary ?? generateTemplateSummary(stats);
  const source     = llmSummary ? 'github-models-gpt-4o-mini' : 'template';

  const digest = {
    date:        targetDate,
    generatedAt: new Date().toISOString(),
    summary,
    stats: {
      commits:      stats.commits,
      reposTouched: stats.reposTouched,
      pullRequests:  stats.pullRequests,
    },
    source,
  };

  mkdirSync(dirname(fileURLToPath(OUTPUT_PATH)), { recursive: true });
  writeFileSync(fileURLToPath(OUTPUT_PATH), JSON.stringify(digest, null, 2) + '\n');

  console.log(`✅  Digest written (source: ${source})`);
  console.log(`    Summary: "${summary.slice(0, 100)}${summary.length > 100 ? '...' : ''}"`);
  process.exit(0);
} catch (err) {
  console.error(`❌  Digest generation failed: ${err.message}`);
  // Exit 0 so the workflow step doesn't fail a deploy over a missing digest
  process.exit(0);
}
