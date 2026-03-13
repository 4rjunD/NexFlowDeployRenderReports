// ─────────────────────────────────────────────────────────────
// Anomaly Detection — Flag statistical outliers in contributor metrics
// Uses cross-contributor z-scores (current period) + team-level
// trend z-scores (vs prior periods)
// ─────────────────────────────────────────────────────────────

import type { PriorContext } from "@/lib/ai/claude";

// ── Types ──

export interface ContributorSnapshot {
  name: string;
  commitsPerDay: number;
  prMergeRate: number;
  prsOpened: number;
  reviewCount: number;
  slackMessages: number;
}

export interface AnomalyResult {
  contributor: string;
  metric: string;
  label: string;
  currentValue: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  direction: "positive" | "negative";
  severity: "high" | "extreme"; // |z| >= 2 = high, |z| >= 3 = extreme
}

export interface TeamTrend {
  metric: string;
  label: string;
  currentValue: number;
  historicalMean: number;
  zScore: number;
  direction: "positive" | "negative";
  severity: "high" | "extreme";
}

export interface AnomalyReport {
  contributorAnomalies: AnomalyResult[];
  teamTrends: TeamTrend[];
  contributorsAnalyzed: number;
  metricsAnalyzed: number;
}

// ── Helpers ──

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const BOTS = new Set([
  "dependabot[bot]", "github-actions[bot]",
  "devin-ai-integration[bot]", "chatgpt-codex-connector[bot]",
  "renovate[bot]", "codecov[bot]", "linear[bot]",
]);

const CONTRIBUTOR_METRICS: {
  key: keyof ContributorSnapshot;
  label: string;
  minSampleSize: number;
}[] = [
  { key: "commitsPerDay", label: "Commits per day", minSampleSize: 3 },
  { key: "prMergeRate", label: "PR merge rate", minSampleSize: 3 },
  { key: "prsOpened", label: "PRs opened", minSampleSize: 3 },
  { key: "reviewCount", label: "Reviews performed", minSampleSize: 3 },
];

const TEAM_METRICS: {
  key: string;
  label: string;
}[] = [
  { key: "totalCommits", label: "Total commits" },
  { key: "prsMerged", label: "PRs merged" },
  { key: "prMergeRate", label: "PR merge rate" },
  { key: "avgPrMergeTimeHours", label: "Avg merge time" },
  { key: "totalReviews", label: "Total reviews" },
  { key: "totalMessages", label: "Slack messages" },
  { key: "issuesCompleted", label: "Issues completed" },
];

// ── Core ──

function extractContributorSnapshots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integrationData: Record<string, any>,
  periodDays: number
): ContributorSnapshot[] {
  const gh = integrationData.github;
  if (!gh) return [];

  const commitsByAuthor: Record<string, number> = gh.commits?.byAuthor || {};
  const openedByAuthor: Record<string, number> = gh.pullRequests?.openedByAuthor || {};
  const mergedByAuthor: Record<string, number> = gh.pullRequests?.mergedByAuthor || {};
  const reviewsByReviewer: Record<string, number> = gh.reviews?.byReviewer || {};

  // Slack top contributors (if available)
  const slackContribs: Record<string, number> = {};
  if (integrationData.slack?.topContributors) {
    for (const c of integrationData.slack.topContributors) {
      slackContribs[c.displayName] = c.messageCount;
    }
  }

  // Build unique set of human contributor handles
  const handles = new Set<string>();
  for (const h of Object.keys(commitsByAuthor)) {
    if (!BOTS.has(h)) handles.add(h);
  }
  for (const h of Object.keys(openedByAuthor)) {
    if (!BOTS.has(h)) handles.add(h);
  }

  return Array.from(handles).map((name) => {
    const commits = commitsByAuthor[name] || 0;
    const opened = openedByAuthor[name] || 0;
    const merged = mergedByAuthor[name] || 0;
    const reviews = reviewsByReviewer[name] || 0;

    return {
      name,
      commitsPerDay: Math.round((commits / periodDays) * 100) / 100,
      prMergeRate: opened > 0 ? Math.round((merged / opened) * 100) : 0,
      prsOpened: opened,
      reviewCount: reviews,
      slackMessages: slackContribs[name] || 0,
    };
  });
}

function detectContributorAnomalies(snapshots: ContributorSnapshot[]): AnomalyResult[] {
  if (snapshots.length < 3) return []; // Need minimum sample

  const results: AnomalyResult[] = [];

  for (const metric of CONTRIBUTOR_METRICS) {
    const values = snapshots.map((s) => s[metric.key] as number);
    if (values.length < metric.minSampleSize) continue;

    const m = mean(values);
    const sd = stdDev(values);
    if (sd === 0) continue; // No variance = no anomalies

    for (const snapshot of snapshots) {
      const value = snapshot[metric.key] as number;
      const z = (value - m) / sd;

      if (Math.abs(z) >= 2.0) {
        results.push({
          contributor: snapshot.name,
          metric: metric.key,
          label: metric.label,
          currentValue: value,
          baselineMean: Math.round(m * 100) / 100,
          baselineStdDev: Math.round(sd * 100) / 100,
          zScore: Math.round(z * 100) / 100,
          direction: z > 0 ? "positive" : "negative",
          severity: Math.abs(z) >= 3.0 ? "extreme" : "high",
        });
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

function detectTeamTrends(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentMetrics: Record<string, any>,
  priorContexts: PriorContext[]
): TeamTrend[] {
  if (priorContexts.length < 2) return []; // Need 2+ periods for meaningful baseline

  const results: TeamTrend[] = [];

  for (const metric of TEAM_METRICS) {
    const currentVal = typeof currentMetrics[metric.key] === "number"
      ? currentMetrics[metric.key]
      : undefined;
    if (currentVal === undefined) continue;

    const priorValues = priorContexts
      .map((ctx) => {
        const km = ctx.keyMetrics as Record<string, number>;
        return typeof km[metric.key] === "number" ? km[metric.key] : undefined;
      })
      .filter((v): v is number => v !== undefined);

    if (priorValues.length < 2) continue;

    const m = mean(priorValues);
    const sd = stdDev(priorValues);
    if (sd === 0) continue;

    const z = (currentVal - m) / sd;
    if (Math.abs(z) >= 2.0) {
      results.push({
        metric: metric.key,
        label: metric.label,
        currentValue: Math.round(currentVal * 100) / 100,
        historicalMean: Math.round(m * 100) / 100,
        zScore: Math.round(z * 100) / 100,
        direction: z > 0 ? "positive" : "negative",
        severity: Math.abs(z) >= 3.0 ? "extreme" : "high",
      });
    }
  }

  return results.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

// ── Public API ──

export function detectAnomalies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integrationData: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentKeyMetrics: Record<string, any>,
  priorContexts: PriorContext[],
  periodDays = 90
): AnomalyReport {
  const snapshots = extractContributorSnapshots(integrationData, periodDays);
  const contributorAnomalies = detectContributorAnomalies(snapshots);
  const teamTrends = detectTeamTrends(currentKeyMetrics, priorContexts);

  return {
    contributorAnomalies,
    teamTrends,
    contributorsAnalyzed: snapshots.length,
    metricsAnalyzed: CONTRIBUTOR_METRICS.length + TEAM_METRICS.length,
  };
}
