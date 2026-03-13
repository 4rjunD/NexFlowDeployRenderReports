// ─────────────────────────────────────────────────────────────
// Trend Comparison — Compute deltas between current & prior periods
// ─────────────────────────────────────────────────────────────

import type { PriorContext } from "@/lib/ai/claude";

// ── Types ──

export type TrendDirection = "up" | "down" | "stable";

export interface MetricTrend {
  metric: string;
  label: string;
  currentValue: number;
  priorValue: number;
  delta: number;
  pctChange: number;
  direction: TrendDirection;
  isPositive: boolean; // whether the direction is good for this metric
}

export interface TrendReport {
  trends: MetricTrend[];
  periodsCompared: number;
  currentPeriod: string;
  priorPeriod: string;
}

// ── Config ──

const METRIC_CONFIG: Record<string, { label: string; higherIsGood: boolean }> = {
  totalCommits: { label: "Total Commits", higherIsGood: true },
  prsOpened: { label: "PRs Opened", higherIsGood: true },
  prsMerged: { label: "PRs Merged", higherIsGood: true },
  prMergeRate: { label: "PR Merge Rate", higherIsGood: true },
  avgPrMergeTimeHours: { label: "Avg PR Merge Time", higherIsGood: false },
  totalReviews: { label: "Total Reviews", higherIsGood: true },
  activeContributors: { label: "Active Contributors", higherIsGood: true },
  repoCount: { label: "Active Repos", higherIsGood: true },
  issuesTotal: { label: "Total Issues", higherIsGood: true },
  issuesCompleted: { label: "Issues Completed", higherIsGood: true },
  jiraCompletionRate: { label: "Jira Completion Rate", higherIsGood: true },
  avgResolutionHours: { label: "Avg Resolution Time", higherIsGood: false },
  overdueIssues: { label: "Overdue Issues", higherIsGood: false },
  totalMessages: { label: "Slack Messages", higherIsGood: true },
  activeSlackChannels: { label: "Active Channels", higherIsGood: true },
  totalMeetingHours: { label: "Meeting Hours", higherIsGood: false },
  avgFocusHoursPerDay: { label: "Focus Time (hrs/day)", higherIsGood: true },
  healthScore: { label: "Health Score", higherIsGood: true },
};

// ── Core ──

export function computeTrends(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentMetrics: Record<string, any>,
  priorContexts: PriorContext[]
): TrendReport {
  const emptyReport: TrendReport = {
    trends: [],
    periodsCompared: 0,
    currentPeriod: "",
    priorPeriod: "",
  };

  if (priorContexts.length === 0) return emptyReport;

  // Use most recent prior context as comparison
  const prior = priorContexts[0];
  const priorMetrics = prior.keyMetrics as Record<string, number>;
  const trends: MetricTrend[] = [];

  for (const [key, config] of Object.entries(METRIC_CONFIG)) {
    const current = typeof currentMetrics[key] === "number" ? currentMetrics[key] : undefined;
    const priorVal = typeof priorMetrics[key] === "number" ? priorMetrics[key] : undefined;

    if (current === undefined || priorVal === undefined) continue;
    if (current === 0 && priorVal === 0) continue;

    const delta = current - priorVal;
    const pctChange = priorVal !== 0
      ? Math.round(((current - priorVal) / priorVal) * 1000) / 10
      : current > 0 ? 100 : 0;

    let direction: TrendDirection;
    if (Math.abs(pctChange) < 3) {
      direction = "stable";
    } else if (delta > 0) {
      direction = "up";
    } else {
      direction = "down";
    }

    const isPositive =
      direction === "stable" ||
      (direction === "up" && config.higherIsGood) ||
      (direction === "down" && !config.higherIsGood);

    trends.push({
      metric: key,
      label: config.label,
      currentValue: Math.round(current * 10) / 10,
      priorValue: Math.round(priorVal * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      pctChange,
      direction,
      isPositive,
    });
  }

  // Sort by absolute pct change, most significant first
  trends.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));

  return {
    trends,
    periodsCompared: priorContexts.length,
    currentPeriod: currentMetrics._periodEnd || "",
    priorPeriod: prior.periodEnd || "",
  };
}
