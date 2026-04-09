#!/usr/bin/env node
/**
 * pulse-log-cli.mjs — Daily AI usage ingestion CLI.
 *
 * Usage:
 *   node scripts/pulse-log-cli.mjs
 *   node scripts/pulse-log-cli.mjs --date 2026-04-10
 *   node scripts/pulse-log-cli.mjs --json '{"claude":22,"copilot-personal":38,...}'
 *
 * Reads existing archive, appends new DailyPulse, and updates latest.json + meta.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'src/data/ai-pulse');
const ARCHIVE_PATH = resolve(DATA_DIR, 'archive/2026-Q2.json');
const LATEST_PATH = resolve(DATA_DIR, 'latest.json');
const META_PATH = resolve(DATA_DIR, 'meta.json');

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  { id: 'claude',           ctx: 'personal', confidence: 'estimated' },
  { id: 'copilot-personal', ctx: 'personal', confidence: 'measured'  },
  { id: 'chatgpt',          ctx: 'personal', confidence: 'estimated' },
  { id: 'copilot-work',     ctx: 'work',     confidence: 'measured'  },
  { id: 'devin',            ctx: 'work',     confidence: 'measured'  },
  { id: 'm365-copilot',     ctx: 'work',     confidence: 'inferred'  },
];

const TOOL_LABELS = {
  'claude': 'Claude',
  'copilot-personal': 'Copilot Personal',
  'chatgpt': 'ChatGPT',
  'copilot-work': 'Copilot Work (skip on weekends)',
  'devin': 'Devin (skip on weekends, enter 0 if none)',
  'm365-copilot': 'M365 Copilot (skip on weekends)',
};

// Default category splits per tool (percentages)
const CATEGORY_SPLITS = {
  'claude':           [['coding',55],['writing',22],['research',14],['analysis',9]],
  'copilot-personal': [['coding',91],['analysis',9]],
  'chatgpt':          [['research',34],['writing',32],['creative',22],['analysis',12]],
  'copilot-work':     [['coding',86],['analysis',9],['communication',5]],
  'devin':            [['automation',52],['coding',38],['analysis',10]],
  'm365-copilot':     [['communication',45],['writing',37],['analysis',18]],
};

const PROMPT_TYPES = {
  'claude':           ['architecture','refactor','debug','code-review','documentation'],
  'copilot-personal': ['inline-completion','code-generation','chat-request'],
  'chatgpt':          ['research','writing','brainstorm','quick-question'],
  'copilot-work':     ['inline-completion','code-review','pr-assist'],
  'devin':            ['task-delegation','pr-creation','ci-run','test-run'],
  'm365-copilot':     ['email-draft','meeting-summary','document-assist','teams-message'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function computeCategories(toolId, count) {
  const splits = CATEGORY_SPLITS[toolId] ?? [['coding', 100]];
  const categories = [];
  let remaining = count;
  for (let i = 0; i < splits.length; i++) {
    const [cat, pct] = splits[i];
    const isLast = i === splits.length - 1;
    const c = isLast ? remaining : Math.round(count * pct / 100);
    if (c > 0) {
      categories.push({ category: cat, count: c, percentage: Math.round(c / count * 100) });
      remaining -= c;
    }
  }
  return categories;
}

function buildToolUsage(toolId, count) {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (!tool || count === 0) return null;
  return {
    tool: toolId,
    context: tool.ctx,
    interactions: count,
    categories: computeCategories(toolId, count),
    topPromptTypes: (PROMPT_TYPES[toolId] ?? []).slice(0, 3),
    confidence: tool.confidence,
  };
}

function computeStreak(pulses) {
  let streak = 0;
  for (let i = pulses.length - 1; i >= 0; i--) {
    if (pulses[i].totalInteractions > 0) streak++;
    else break;
  }
  return streak;
}

function computeLongestStreak(pulses) {
  let longest = 0, current = 0;
  for (const d of pulses) {
    if (d.totalInteractions > 0) { current++; longest = Math.max(longest, current); }
    else current = 0;
  }
  return longest;
}

function computeTopTool(pulses) {
  const totals = {};
  for (const day of pulses) {
    for (const t of day.tools) {
      totals[t.tool] = (totals[t.tool] ?? 0) + t.interactions;
    }
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'claude';
}

function computeTopCategory(pulses) {
  const counts = {};
  for (const day of pulses) {
    counts[day.dominantCategory] = (counts[day.dominantCategory] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'coding';
}

function computeTrend(pulses) {
  if (pulses.length < 2) return 'stable';
  const mid = Math.floor(pulses.length / 2);
  const firstAvg = pulses.slice(0, mid).reduce((s, d) => s + d.totalInteractions, 0) / mid;
  const secondAvg = pulses.slice(mid).reduce((s, d) => s + d.totalInteractions, 0) / (pulses.length - mid);
  const ratio = secondAvg / Math.max(firstAvg, 1);
  if (ratio > 1.1) return 'rising';
  if (ratio < 0.9) return 'declining';
  return 'stable';
}

function recomputeMeta(pulses) {
  const total = pulses.reduce((s, d) => s + d.totalInteractions, 0);
  const busiest = pulses.reduce((a, b) => b.totalInteractions > a.totalInteractions ? b : a);
  const diverse = pulses.reduce((a, b) => {
    const bC = b.tools.filter((t) => t.interactions > 0).length;
    const aC = a.tools.filter((t) => t.interactions > 0).length;
    return bC > aC ? b : a;
  });

  return {
    totalDays: pulses.length,
    totalInteractions: total,
    currentStreak: computeStreak(pulses),
    longestStreak: computeLongestStreak(pulses),
    topTool: computeTopTool(pulses),
    topCategory: computeTopCategory(pulses),
    weeklyAverage: Math.round(total / pulses.length * 7),
    monthlyTrend: computeTrend(pulses),
    records: {
      busiestDay: { date: busiest.date, count: busiest.totalInteractions },
      longestSession: { date: busiest.date, minutes: 240 },
      mostDiverseDay: {
        date: diverse.date,
        toolCount: diverse.tools.filter((t) => t.interactions > 0).length,
      },
    },
  };
}

// ── Interactive prompt ────────────────────────────────────────────────────────

async function promptInteractive(date) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  function ask(q) {
    return new Promise((res) => rl.question(q, res));
  }

  console.log(`\n📊 Pulse Log — Daily Ingestion`);
  console.log(`Date: ${date}\n`);

  const counts = {};
  for (const tool of TOOLS) {
    const label = TOOL_LABELS[tool.id] ?? tool.id;
    const raw = await ask(`  ${label}: `);
    counts[tool.id] = Math.max(0, parseInt(raw, 10) || 0);
  }

  const summaryRaw = await ask('\n  Daily summary (press Enter to use default): ');
  const peakHourRaw = await ask('  Peak hour [e.g. 16:00]: ');

  rl.close();

  const totalInteractions = Object.values(counts).reduce((s, v) => s + v, 0);
  const summary = summaryRaw.trim() || `AI usage on ${date} — ${totalInteractions} total interactions.`;
  const peakHour = /^\d{2}:\d{2}$/.test(peakHourRaw.trim()) ? peakHourRaw.trim() : '17:00';

  // Determine dominant category
  const catTotals = {};
  for (const [toolId, count] of Object.entries(counts)) {
    if (count === 0) continue;
    for (const [cat, pct] of (CATEGORY_SPLITS[toolId] ?? [])) {
      const c = Math.round(count * pct / 100);
      catTotals[cat] = (catTotals[cat] ?? 0) + c;
    }
  }
  const dominantCategory =
    Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'coding';

  const tools = Object.entries(counts)
    .map(([id, n]) => buildToolUsage(id, n))
    .filter(Boolean);

  return { date, totalInteractions, peakHour, dominantCategory, summary, tools };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dateArg = args.find((a) => a.startsWith('--date='))?.split('=')[1]
    ?? (args.includes('--date') ? args[args.indexOf('--date') + 1] : null)
    ?? today();

  const jsonArg = args.find((a) => a.startsWith('--json='))?.split('=').slice(1).join('=')
    ?? (args.includes('--json') ? args[args.indexOf('--json') + 1] : null);

  // Load archive
  const archive = existsSync(ARCHIVE_PATH)
    ? JSON.parse(readFileSync(ARCHIVE_PATH, 'utf8'))
    : [];

  // Check for duplicate
  if (archive.some((d) => d.date === dateArg)) {
    console.warn(`⚠️  Entry for ${dateArg} already exists. Overwrite? (y/N)`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise((r) => rl.question('', r));
    rl.close();
    if (ans.trim().toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
    // Remove existing
    const idx = archive.findIndex((d) => d.date === dateArg);
    archive.splice(idx, 1);
  }

  let newDay;
  if (jsonArg) {
    // Non-interactive mode: parse JSON counts
    const counts = JSON.parse(jsonArg);
    const totalInteractions = Object.values(counts).reduce((s, v) => s + Number(v), 0);
    const tools = Object.entries(counts)
      .map(([id, n]) => buildToolUsage(id, Number(n)))
      .filter(Boolean);
    newDay = {
      date: dateArg,
      totalInteractions,
      peakHour: '17:00',
      dominantCategory: 'coding',
      summary: `AI usage on ${dateArg} — ${totalInteractions} total interactions.`,
      tools,
    };
  } else {
    newDay = await promptInteractive(dateArg);
  }

  // Append and sort
  archive.push(newDay);
  archive.sort((a, b) => a.date.localeCompare(b.date));

  // Write files
  writeFileSync(ARCHIVE_PATH, JSON.stringify(archive, null, 2));
  writeFileSync(LATEST_PATH, JSON.stringify(newDay, null, 2));

  const meta = recomputeMeta(archive);
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  console.log(`\n✅ Ingested ${newDay.totalInteractions} interactions for ${dateArg}.`);
  console.log(`   Streak: ${meta.currentStreak} days | Total: ${meta.totalInteractions}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
