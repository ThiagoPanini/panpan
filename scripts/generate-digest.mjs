#!/usr/bin/env node
/**
 * generate-digest.mjs
 *
 * Runs at CI time (daily cron + workflow_dispatch). Writes two JSON data
 * files consumed by the Astro build — zero runtime API calls in production.
 *
 *   src/data/github-digest/latest.json  — last 7 days activity summary (LLM or template)
 *   src/data/recent-repos.json          — top 3 repos by recency + last 5 commits each
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
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname }                  from 'node:path';
import { fileURLToPath }            from 'node:url';

// ── Config ────────────────────────────────────────────────────────────────────

const GITHUB_USERNAME   = process.env.GITHUB_USERNAME ?? 'ThiagoPanini';
const GH_TOKEN          = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const MODELS_TOKEN      = process.env.MODELS_TOKEN ?? '';
const RECENT_REPO_COUNT = 3; // cards rendered in the Projects grid

// Week window: last 7 days ending yesterday (UTC)
const weekEnd = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
})();

const weekStart = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().split('T')[0];
})();

const OUTPUT_DIGEST = new URL('../src/data/github-digest/latest.json', import.meta.url);
const OUTPUT_REPOS  = new URL('../src/data/recent-repos.json',          import.meta.url);

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

// ── Event fetching (for weekly digest) ───────────────────────────────────────

/**
 * Fetches public events for the user from the last 7 days.
 */
async function fetchWeekEvents() {
  const start = new Date(`${weekStart}T00:00:00Z`).getTime();
  const end   = new Date(`${weekEnd}T23:59:59Z`).getTime();

  const allEvents = [];
  for (let page = 1; page <= 7; page++) {
    try {
      const page_events = await ghGet(
        `/users/${GITHUB_USERNAME}/events?per_page=100&page=${page}`,
      );
      if (!Array.isArray(page_events) || page_events.length === 0) break;
      allEvents.push(...page_events);
      // Events are newest-first; stop once we've passed the week start
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

// ── Aggregation (for digest) ──────────────────────────────────────────────────

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

// ── LLM summary via GitHub Models ─────────────────────────────────────────────

/**
 * Calls the GitHub Models inference endpoint with a curated event context.
 * Requires a PAT with `models:read` scope stored as MODELS_TOKEN secret.
 * Returns null on any failure so the caller can fall back to a template.
 */
async function generateLLMSummary(events, stats) {
  if (!MODELS_TOKEN) return null;

  const eventFeed = events
    .slice(0, 40)
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
    `You are summarising a developer's GitHub activity for the past week (${weekStart} to ${weekEnd}).`,
    '',
    'Activity log (sample of events, newest first):',
    eventFeed,
    '',
    `Weekly stats: ${stats.commits} commits, ${stats.pullRequests} PRs, across ${stats.reposTouched.join(', ') || 'various repos'}.`,
    '',
    'Write ONE flowing sentence (max 240 characters) capturing what was built or changed during the week.',
    'Use present-tense narrative. Be specific about the projects and features. No quotes, no markdown, no "The developer".',
  ].join('\n');

  try {
    const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MODELS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.6,
      }),
    });
    if (!res.ok) {
      console.warn(`GitHub Models API returned ${res.status} — using template summary.`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.warn(`GitHub Models request failed: ${err.message} — using template summary.`);
    return null;
  }
}

// ── Template summary (fallback) ───────────────────────────────────────────────

function generateTemplateSummary(stats) {
  if (stats.eventCount === 0) {
    return `No recorded GitHub activity from ${weekStart} to ${weekEnd}.`;
  }
  const parts = [];
  if (stats.commits > 0)
    parts.push(`${stats.commits} commit${stats.commits === 1 ? '' : 's'}`);
  if (stats.pullRequests > 0)
    parts.push(`${stats.pullRequests} PR${stats.pullRequests === 1 ? '' : 's'}`);
  if (stats.issuesClosed > 0)
    parts.push(`${stats.issuesClosed} issue${stats.issuesClosed === 1 ? '' : 's'} closed`);

  const repoList    = stats.reposTouched.slice(0, 3).join(', ');
  const activityStr = parts.length > 0 ? parts.join(', ') : 'Activity recorded';
  return `${activityStr} across ${repoList || 'multiple repos'} this week.`;
}

// ── Recent repositories ───────────────────────────────────────────────────────

/**
 * Fetches the N most recently pushed non-fork repos, then for each:
 *   - resolves the top-2 programming languages by byte count
 *   - fetches commits from the last 7 days (for per-repo activity chart)
 *   - takes the last 5 commits for the hover-reveal back face (with full commit URL)
 */
async function fetchRecentRepos(count = RECENT_REPO_COUNT) {
  let repos;
  try {
    repos = await ghGet(
      `/users/${GITHUB_USERNAME}/repos?sort=pushed&per_page=30&type=owner`,
    );
  } catch (err) {
    console.warn(`fetchRecentRepos: repo list failed — ${err.message}`);
    return [];
  }

  if (!Array.isArray(repos)) return [];
  const selected = repos.filter((r) => !r.fork).slice(0, count);

  // 7-day window boundaries (shared across all repos)
  const now = new Date();
  const sinceDate = new Date(now);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 6);
  sinceDate.setUTCHours(0, 0, 0, 0);

  return Promise.all(
    selected.map(async (repo) => {
      // Languages
      let technologies = [repo.language ?? 'Unknown'].filter(Boolean);
      try {
        const langs = await ghGet(`/repos/${GITHUB_USERNAME}/${repo.name}/languages`);
        if (langs && typeof langs === 'object' && !Array.isArray(langs)) {
          const sorted = Object.entries(langs)
            .sort(([, a], [, b]) => b - a)
            .map(([lang]) => lang)
            .slice(0, 2);
          if (sorted.length > 0) technologies = sorted;
        }
      } catch { /* use fallback */ }

      // Per-repo 7-day commit activity buckets
      const buckets = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        buckets[d.toISOString().split('T')[0]] = 0;
      }

      // Fetch commits from last 7 days for both the activity chart and the back face
      let lastCommits = [];
      try {
        const recentCommits = await ghGet(
          `/repos/${GITHUB_USERNAME}/${repo.name}/commits` +
          `?since=${sinceDate.toISOString()}&per_page=100&author=${GITHUB_USERNAME}`,
        );
        if (Array.isArray(recentCommits)) {
          for (const c of recentCommits) {
            const dateStr = (c.commit?.author?.date ?? c.commit?.committer?.date ?? '')
              .split('T')[0];
            if (dateStr && Object.prototype.hasOwnProperty.call(buckets, dateStr)) {
              buckets[dateStr]++;
            }
          }
          // Newest-first slice for the back face
          lastCommits = recentCommits.slice(0, 5).map((c) => ({
            sha:     (c.sha ?? '').slice(0, 7),
            message: (c.commit?.message ?? '').split('\n')[0].trim(),
            date:    c.commit?.author?.date ?? c.commit?.committer?.date ?? '',
            url:     `https://github.com/${GITHUB_USERNAME}/${repo.name}/commit/${c.sha}`,
          }));
        }
      } catch { /* empty commits */ }

      // If fewer than 5 commits in the window, backfill from latest overall
      if (lastCommits.length < 5) {
        try {
          const extra = await ghGet(
            `/repos/${GITHUB_USERNAME}/${repo.name}/commits?per_page=5`,
          );
          if (Array.isArray(extra)) {
            const known = new Set(lastCommits.map((c) => c.sha));
            for (const c of extra) {
              if (lastCommits.length >= 5) break;
              const sha7 = (c.sha ?? '').slice(0, 7);
              if (!known.has(sha7)) {
                lastCommits.push({
                  sha:     sha7,
                  message: (c.commit?.message ?? '').split('\n')[0].trim(),
                  date:    c.commit?.author?.date ?? c.commit?.committer?.date ?? '',
                  url:     `https://github.com/${GITHUB_USERNAME}/${repo.name}/commit/${c.sha}`,
                });
                known.add(sha7);
              }
            }
          }
        } catch { /* ignore */ }
      }

      const commitActivity = Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      return {
        name:           repo.name,
        description:    repo.description ?? '',
        url:            repo.html_url,
        language:       repo.language ?? 'Unknown',
        technologies,
        stars:          repo.stargazers_count ?? 0,
        forks:          repo.forks_count ?? 0,
        topics:         (repo.topics ?? []).slice(0, 5),
        pushedAt:       repo.pushed_at ?? repo.updated_at,
        lastCommits,
        commitActivity,
      };
    }),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  console.log(`[generate-digest] week: ${weekStart} → ${weekEnd}`);

  // Run fetches in parallel for speed
  const [events, recentRepos] = await Promise.all([
    fetchWeekEvents(),
    fetchRecentRepos(),
  ]);

  // ── Digest ──
  const stats      = aggregateEvents(events);
  const llmSummary = await generateLLMSummary(events, stats);
  const summary    = llmSummary ?? generateTemplateSummary(stats);
  const source     = llmSummary ? 'github-models-gpt-4o' : 'template';

  const digest = {
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    summary,
    stats: {
      commits:      stats.commits,
      reposTouched: stats.reposTouched,
      pullRequests: stats.pullRequests,
    },
    source,
  };

  // ── Write files ──
  const ensureDir = (url) =>
    mkdirSync(dirname(fileURLToPath(url)), { recursive: true });

  ensureDir(OUTPUT_DIGEST);
  writeFileSync(fileURLToPath(OUTPUT_DIGEST), JSON.stringify(digest, null, 2) + '\n');

  ensureDir(OUTPUT_REPOS);
  writeFileSync(fileURLToPath(OUTPUT_REPOS),  JSON.stringify(recentRepos, null, 2) + '\n');

  console.log(`✅  Digest written       (source: ${source})`);
  console.log(`✅  Recent repos written (${recentRepos.length} repos, each with 7-day activity)`);
  console.log(`    Summary: "${summary.slice(0, 100)}${summary.length > 100 ? '...' : ''}"`);
  process.exit(0);
} catch (err) {
  console.error(`❌  Script failed: ${err.message}`);
  // Exit 0 so the workflow step does not block a deploy over a missing digest
  process.exit(0);
}
