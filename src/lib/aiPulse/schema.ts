/**
 * AI Pulse Log — Schema
 * TypeScript types for the pulse data model.
 */

export type ToolId =
  | 'claude'
  | 'copilot-personal'
  | 'chatgpt'
  | 'copilot-work'
  | 'devin'
  | 'm365-copilot';

export type UsageContext = 'personal' | 'work';

export type Category =
  | 'coding'
  | 'writing'
  | 'research'
  | 'automation'
  | 'analysis'
  | 'communication'
  | 'creative';

export type ConfidenceLevel = 'measured' | 'estimated' | 'inferred';

export type MonthlyTrend = 'rising' | 'stable' | 'declining';

export interface CategoryBreakdown {
  category: Category;
  count: number;
  percentage: number;
}

export interface ToolUsage {
  tool: ToolId;
  context: UsageContext;
  interactions: number;
  categories: CategoryBreakdown[];
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  topPromptTypes: string[];
  activeMinutes?: number;
  models?: string[];
  agentsTriggered?: string[];
  confidence: ConfidenceLevel;
}

export interface DailyPulse {
  date: string; // ISO 8601: YYYY-MM-DD
  totalInteractions: number;
  peakHour: string; // "HH:00"
  dominantCategory: Category;
  summary: string;
  tools: ToolUsage[];
}

export interface PulseMeta {
  totalDays: number;
  totalInteractions: number;
  currentStreak: number;
  longestStreak: number;
  topTool: ToolId;
  topCategory: Category;
  weeklyAverage: number;
  monthlyTrend: MonthlyTrend;
  records: {
    busiestDay: { date: string; count: number };
    longestSession: { date: string; minutes: number };
    mostDiverseDay: { date: string; toolCount: number };
  };
}

// ── Runtime validation ──────────────────────────────────────────────────────

const VALID_TOOLS = new Set<string>([
  'claude', 'copilot-personal', 'chatgpt', 'copilot-work', 'devin', 'm365-copilot',
]);
const VALID_CONTEXTS = new Set<string>(['personal', 'work']);
const VALID_CATEGORIES = new Set<string>([
  'coding', 'writing', 'research', 'automation', 'analysis', 'communication', 'creative',
]);

export function validateDailyPulse(data: unknown): data is DailyPulse {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.date !== 'string') return false;
  if (typeof d.totalInteractions !== 'number') return false;
  if (!Array.isArray(d.tools)) return false;
  for (const t of d.tools as unknown[]) {
    if (!validateToolUsage(t)) return false;
  }
  return true;
}

export function validateToolUsage(data: unknown): data is ToolUsage {
  if (!data || typeof data !== 'object') return false;
  const t = data as Record<string, unknown>;
  if (!VALID_TOOLS.has(t.tool as string)) return false;
  if (!VALID_CONTEXTS.has(t.context as string)) return false;
  if (typeof t.interactions !== 'number') return false;
  if (!Array.isArray(t.categories)) return false;
  for (const c of t.categories as unknown[]) {
    const cb = c as Record<string, unknown>;
    if (!VALID_CATEGORIES.has(cb.category as string)) return false;
  }
  return true;
}
