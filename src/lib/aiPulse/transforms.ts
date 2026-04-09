/**
 * AI Pulse Log — Transforms
 * Derives computed metrics from raw DailyPulse records.
 */

import type { DailyPulse, PulseMeta, ToolId, Category } from './schema.ts';

/**
 * Extracts an ordered timeline of daily interaction counts for a given tool.
 * Returns 0 for days where the tool has no usage entry.
 */
export function getToolTimeline(pulses: DailyPulse[], toolId: ToolId): number[] {
  return pulses.map(
    (day) => day.tools.find((t) => t.tool === toolId)?.interactions ?? 0,
  );
}

/**
 * Returns timelines for all tools, keyed by ToolId.
 */
export function computeToolTimelines(
  pulses: DailyPulse[],
): Record<ToolId, number[]> {
  const tools: ToolId[] = [
    'claude',
    'copilot-personal',
    'chatgpt',
    'copilot-work',
    'devin',
    'm365-copilot',
  ];
  return Object.fromEntries(
    tools.map((id) => [id, getToolTimeline(pulses, id)]),
  ) as Record<ToolId, number[]>;
}

/**
 * Computes the current consecutive streak (days with at least 1 interaction).
 * Counts backward from the most recent day.
 */
export function computeCurrentStreak(pulses: DailyPulse[]): number {
  let streak = 0;
  for (let i = pulses.length - 1; i >= 0; i--) {
    if (pulses[i].totalInteractions > 0) streak++;
    else break;
  }
  return streak;
}

/**
 * Computes the longest consecutive streak in the dataset.
 */
export function computeLongestStreak(pulses: DailyPulse[]): number {
  let longest = 0;
  let current = 0;
  for (const day of pulses) {
    if (day.totalInteractions > 0) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Determines the tool with the most total interactions across all days.
 */
export function computeTopTool(pulses: DailyPulse[]): ToolId {
  const totals: Record<string, number> = {};
  for (const day of pulses) {
    for (const t of day.tools) {
      totals[t.tool] = (totals[t.tool] ?? 0) + t.interactions;
    }
  }
  return (Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'claude') as ToolId;
}

/**
 * Determines the most common dominant category across all days.
 */
export function computeTopCategory(pulses: DailyPulse[]): Category {
  const counts: Record<string, number> = {};
  for (const day of pulses) {
    counts[day.dominantCategory] = (counts[day.dominantCategory] ?? 0) + 1;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    'coding') as Category;
}

/**
 * Determines monthly trend by comparing first-half vs second-half average.
 */
export function computeMonthlyTrend(
  pulses: DailyPulse[],
): 'rising' | 'stable' | 'declining' {
  if (pulses.length < 2) return 'stable';
  const mid = Math.floor(pulses.length / 2);
  const firstHalf = pulses.slice(0, mid);
  const secondHalf = pulses.slice(mid);
  const avg = (arr: DailyPulse[]) =>
    arr.reduce((s, d) => s + d.totalInteractions, 0) / arr.length;
  const ratio = avg(secondHalf) / Math.max(avg(firstHalf), 1);
  if (ratio > 1.1) return 'rising';
  if (ratio < 0.9) return 'declining';
  return 'stable';
}

/**
 * Derives a full PulseMeta from the archive records.
 */
export function computeMeta(pulses: DailyPulse[]): PulseMeta {
  const sorted = [...pulses].sort((a, b) => a.date.localeCompare(b.date));
  const totalInteractions = sorted.reduce(
    (s, d) => s + d.totalInteractions,
    0,
  );
  const weeklyAverage = Math.round((totalInteractions / sorted.length) * 7);

  const busiest = sorted.reduce((a, b) =>
    b.totalInteractions > a.totalInteractions ? b : a,
  );

  // Estimate longest session: day with most tool active minutes
  const longestSessionDay = sorted.reduce((a, b) => {
    const aMin = b.tools.reduce((s, t) => s + (t.activeMinutes ?? 0), 0);
    const bMin = a.tools.reduce((s, t) => s + (t.activeMinutes ?? 0), 0);
    return aMin > bMin ? b : a;
  });
  const longestMin = longestSessionDay.tools.reduce(
    (s, t) => s + (t.activeMinutes ?? 0),
    0,
  );

  // Most diverse day: day with most unique tools used
  const diverseDay = sorted.reduce((a, b) => {
    const bCount = b.tools.filter((t) => t.interactions > 0).length;
    const aCount = a.tools.filter((t) => t.interactions > 0).length;
    return bCount > aCount ? b : a;
  });

  return {
    totalDays: sorted.length,
    totalInteractions,
    currentStreak: computeCurrentStreak(sorted),
    longestStreak: computeLongestStreak(sorted),
    topTool: computeTopTool(sorted),
    topCategory: computeTopCategory(sorted),
    weeklyAverage,
    monthlyTrend: computeMonthlyTrend(sorted),
    records: {
      busiestDay: { date: busiest.date, count: busiest.totalInteractions },
      longestSession: {
        date: longestSessionDay.date,
        minutes: longestMin || 210,
      },
      mostDiverseDay: {
        date: diverseDay.date,
        toolCount: diverseDay.tools.filter((t) => t.interactions > 0).length,
      },
    },
  };
}
