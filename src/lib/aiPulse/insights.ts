/**
 * AI Pulse Log — Insights
 * Derives human-readable insight strings from pulse meta and latest day data.
 */

import type { PulseMeta, DailyPulse, ToolId } from './schema.ts';

const TOOL_LABELS: Record<ToolId, string> = {
  claude: 'Claude',
  'copilot-personal': 'Copilot Personal',
  chatgpt: 'ChatGPT',
  'copilot-work': 'Copilot Work',
  devin: 'Devin',
  'm365-copilot': 'M365 Copilot',
};

export interface Insight {
  id: string;
  label: string;
  value: string;
  detail: string;
}

/**
 * Generates a set of key insights from the pulse meta and the latest day.
 */
export function generateInsights(
  meta: PulseMeta,
  latest: DailyPulse,
): Insight[] {
  const insights: Insight[] = [];

  // Streak insight
  if (meta.currentStreak >= 7) {
    insights.push({
      id: 'streak',
      label: 'Streak',
      value: `${meta.currentStreak}d`,
      detail: `${meta.currentStreak} consecutive days with AI activity — longest run: ${meta.longestStreak}d.`,
    });
  }

  // Top tool insight
  insights.push({
    id: 'top-tool',
    label: 'Top tool',
    value: TOOL_LABELS[meta.topTool],
    detail: `${TOOL_LABELS[meta.topTool]} led interactions in the last ${meta.totalDays} days.`,
  });

  // Trend insight
  const trendText =
    meta.monthlyTrend === 'rising'
      ? 'Usage trending upward this month.'
      : meta.monthlyTrend === 'declining'
        ? 'Usage trending down — time to audit?'
        : 'Usage stable this month.';
  insights.push({
    id: 'trend',
    label: 'Monthly trend',
    value:
      meta.monthlyTrend === 'rising'
        ? '↑ Rising'
        : meta.monthlyTrend === 'declining'
          ? '↓ Declining'
          : '→ Stable',
    detail: trendText,
  });

  // Weekly average insight
  insights.push({
    id: 'weekly-avg',
    label: 'Weekly avg',
    value: `${meta.weeklyAverage.toLocaleString()}`,
    detail: `${meta.weeklyAverage} interactions per week on average over ${meta.totalDays} days.`,
  });

  // Busiest day insight
  insights.push({
    id: 'busiest',
    label: 'Peak day',
    value: formatDate(meta.records.busiestDay.date),
    detail: `${meta.records.busiestDay.count} interactions — busiest recorded day.`,
  });

  // Today context
  const todayCoding = latest.tools
    .flatMap((t) => t.categories)
    .filter((c) => c.category === 'coding')
    .reduce((s, c) => s + c.count, 0);

  if (todayCoding > 0) {
    insights.push({
      id: 'today-focus',
      label: 'Today',
      value: `${latest.totalInteractions} interactions`,
      detail: latest.summary,
    });
  }

  return insights;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
