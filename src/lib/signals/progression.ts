// ─────────────────────────────────────────────────────────────
// Progression Tracking — "Since You Started Using NexFlow"
// Computes long-term progression and industry benchmark comparisons
// ─────────────────────────────────────────────────────────────

import type { PriorContext } from "@/lib/ai/claude";

// ── Progression Types ──

export interface ProgressionMetric {
  label: string;
  firstValue: number;
  currentValue: number;
  totalDelta: number;
  totalPctChange: number;
  direction: "improved" | "regressed" | "stable";
  isPositive: boolean;
}

export interface ProgressionSummary {
  reportCount: number;
  firstReportDate: string;
  weeksTracked: number;
  metrics: ProgressionMetric[];
  healthScoreJourney: number[];
  estimatedTimeSavedHours: number;
  estimatedCostSavings: number;
  topImprovement: ProgressionMetric | null;
  topRegression: ProgressionMetric | null;
}

// ── Benchmark Types ──

export interface BenchmarkComparison {
  metric: string;
  label: string;
  currentValue: number;
  benchmarkValue: number;
  benchmarkLabel: string;
  performance: "above" | "at" | "below";
  gap: number;
}

export interface BenchmarkReport {
  comparisons: BenchmarkComparison[];
  overallPerformance: "above_average" | "average" | "below_average";
  sourcesUsed: string[];
}

// ── Progression Config ──

interface ProgressionMetricConfig {
  key: string;
  label: string;
  higherIsGood: boolean;
}

const PROGRESSION_METRICS: ProgressionMetricConfig[] = [
  { key: "healthScore", label: "Health Score", higherIsGood: true },
  { key: "avgPrMergeTimeHours", label: "PR Merge Time", higherIsGood: false },
  { key: "jiraCompletionRate", label: "Sprint Completion Rate", higherIsGood: true },
  { key: "avgReviewTurnaroundHours", label: "Review Turnaround", higherIsGood: false },
  { key: "overdueIssues", label: "Overdue Issues", higherIsGood: false },
  { key: "avgFocusHoursPerDay", label: "Focus Time", higherIsGood: true },
  { key: "stalePrCount", label: "Stale PR Count", higherIsGood: false },
];

// Stable threshold: changes within +/-3% are considered stable
const STABLE_THRESHOLD_PCT = 3;

// ── Benchmark Config (DORA metrics & industry research) ──

interface BenchmarkDefinition {
  key: string;
  label: string;
  benchmarkValue: number;
  benchmarkLabel: string;
  higherIsGood: boolean;
  requiredSource: string;
}

const BENCHMARK_DEFINITIONS: BenchmarkDefinition[] = [
  {
    key: "avgPrMergeTimeHours",
    label: "PR Merge Time",
    benchmarkValue: 24,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: false,
    requiredSource: "github",
  },
  {
    key: "prMergeRate",
    label: "PR Merge Rate",
    benchmarkValue: 85,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: true,
    requiredSource: "github",
  },
  {
    key: "avgReviewTurnaroundHours",
    label: "Review Turnaround",
    benchmarkValue: 12,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: false,
    requiredSource: "github",
  },
  {
    key: "jiraCompletionRate",
    label: "Sprint Completion Rate",
    benchmarkValue: 75,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: true,
    requiredSource: "jira",
  },
  {
    key: "avgFocusHoursPerDay",
    label: "Focus Time",
    benchmarkValue: 4,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: true,
    requiredSource: "googleCalendar",
  },
  {
    key: "totalMeetingHours",
    label: "Meeting Load",
    benchmarkValue: 20,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: false,
    requiredSource: "googleCalendar",
  },
  {
    key: "afterHoursMessagePct",
    label: "After-Hours Messages",
    benchmarkValue: 10,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: false,
    requiredSource: "slack",
  },
  {
    key: "avgThreadResponseMinutes",
    label: "Thread Response Time",
    benchmarkValue: 30,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: false,
    requiredSource: "slack",
  },
  {
    key: "reviewConcentrationPct",
    label: "Review Concentration",
    benchmarkValue: 50,
    benchmarkLabel: "Industry median for engineering teams of 5-50",
    higherIsGood: false,
    requiredSource: "github",
  },
];

// ── Helpers ──

function extractNumeric(
  metrics: Record<string, number | string>,
  key: string
): number | undefined {
  const val = metrics[key];
  if (typeof val === "number" && isFinite(val)) return val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    if (isFinite(parsed)) return parsed;
  }
  return undefined;
}

function weeksBetween(dateA: string, dateB: string): number {
  const msA = new Date(dateA).getTime();
  const msB = new Date(dateB).getTime();
  if (isNaN(msA) || isNaN(msB)) return 0;
  const diffMs = Math.abs(msB - msA);
  return Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

function pctChange(oldVal: number, newVal: number): number {
  if (oldVal === 0) return newVal > 0 ? 100 : 0;
  return Math.round(((newVal - oldVal) / Math.abs(oldVal)) * 1000) / 10;
}

// ── Core: computeProgression ──

export function computeProgression(
  currentMetrics: Record<string, number | string>,
  allPriorContexts: PriorContext[]
): ProgressionSummary | null {
  const reportCount = allPriorContexts.length + 1; // include current

  if (reportCount < 4) {
    return null;
  }

  // Sort contexts oldest-first (last element = most recent prior)
  const sorted = [...allPriorContexts].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );

  const oldest = sorted[0];
  const firstReportDate = oldest.periodStart;
  const mostRecent = sorted[sorted.length - 1];
  const weeksTracked = weeksBetween(firstReportDate, mostRecent.periodEnd);

  // Build health score journey from all contexts + current
  const healthScoreJourney: number[] = [];
  for (const ctx of sorted) {
    const hs = extractNumeric(ctx.keyMetrics, "healthScore");
    if (hs !== undefined) healthScoreJourney.push(hs);
  }
  const currentHS = extractNumeric(currentMetrics, "healthScore");
  if (currentHS !== undefined) healthScoreJourney.push(currentHS);

  // Compare current metrics against the FIRST (oldest) context
  const firstMetrics = oldest.keyMetrics;
  const progressionMetrics: ProgressionMetric[] = [];

  for (const config of PROGRESSION_METRICS) {
    const currentVal = extractNumeric(currentMetrics, config.key);
    const firstVal = extractNumeric(firstMetrics, config.key);

    if (currentVal === undefined || firstVal === undefined) continue;
    if (currentVal === 0 && firstVal === 0) continue;

    const totalDelta = Math.round((currentVal - firstVal) * 10) / 10;
    const totalPct = pctChange(firstVal, currentVal);

    let direction: "improved" | "regressed" | "stable";
    if (Math.abs(totalPct) < STABLE_THRESHOLD_PCT) {
      direction = "stable";
    } else {
      const wentUp = totalDelta > 0;
      if (config.higherIsGood) {
        direction = wentUp ? "improved" : "regressed";
      } else {
        direction = wentUp ? "regressed" : "improved";
      }
    }

    const isPositive = direction === "improved" || direction === "stable";

    progressionMetrics.push({
      label: config.label,
      firstValue: Math.round(firstVal * 10) / 10,
      currentValue: Math.round(currentVal * 10) / 10,
      totalDelta,
      totalPctChange: totalPct,
      direction,
      isPositive,
    });
  }

  // Estimate time saved from improvements
  let estimatedTimeSavedHours = 0;

  // Merge time improvement: (oldTime - newTime) * prsMerged / 60
  const oldMergeTime = extractNumeric(firstMetrics, "avgPrMergeTimeHours");
  const newMergeTime = extractNumeric(currentMetrics, "avgPrMergeTimeHours");
  const prsMerged = extractNumeric(currentMetrics, "prsMerged");
  if (
    oldMergeTime !== undefined &&
    newMergeTime !== undefined &&
    prsMerged !== undefined &&
    oldMergeTime > newMergeTime
  ) {
    estimatedTimeSavedHours += ((oldMergeTime - newMergeTime) * prsMerged) / 60;
  }

  // Completion rate improvement: (newRate - oldRate) * totalIssues * avgResolutionHours / 100
  const oldCompletionRate = extractNumeric(firstMetrics, "jiraCompletionRate");
  const newCompletionRate = extractNumeric(currentMetrics, "jiraCompletionRate");
  const totalIssues = extractNumeric(currentMetrics, "jiraIssuesTotal");
  const avgResolutionHours = extractNumeric(currentMetrics, "jiraAvgResolutionHours");
  if (
    oldCompletionRate !== undefined &&
    newCompletionRate !== undefined &&
    totalIssues !== undefined &&
    avgResolutionHours !== undefined &&
    newCompletionRate > oldCompletionRate
  ) {
    estimatedTimeSavedHours +=
      ((newCompletionRate - oldCompletionRate) * totalIssues * avgResolutionHours) / 100;
  }

  estimatedTimeSavedHours = Math.round(estimatedTimeSavedHours * 10) / 10;
  const estimatedCostSavings = Math.round(estimatedTimeSavedHours * 150);

  // Find top improvement and top regression (by absolute pct change)
  const improvements = progressionMetrics
    .filter((m) => m.direction === "improved")
    .sort((a, b) => Math.abs(b.totalPctChange) - Math.abs(a.totalPctChange));

  const regressions = progressionMetrics
    .filter((m) => m.direction === "regressed")
    .sort((a, b) => Math.abs(b.totalPctChange) - Math.abs(a.totalPctChange));

  return {
    reportCount,
    firstReportDate,
    weeksTracked,
    metrics: progressionMetrics,
    healthScoreJourney,
    estimatedTimeSavedHours,
    estimatedCostSavings,
    topImprovement: improvements.length > 0 ? improvements[0] : null,
    topRegression: regressions.length > 0 ? regressions[0] : null,
  };
}

// ── Core: computeBenchmarks ──

// Source name mapping: integration key -> what appears in connectedSources
const SOURCE_ALIASES: Record<string, string[]> = {
  github: ["github", "GitHub"],
  jira: ["jira", "Jira"],
  googleCalendar: ["googleCalendar", "google_calendar", "Google Calendar"],
  slack: ["slack", "Slack"],
};

function isSourceConnected(
  requiredSource: string,
  connectedSources: string[]
): boolean {
  const aliases = SOURCE_ALIASES[requiredSource] || [requiredSource];
  const lowerConnected = connectedSources.map((s) => s.toLowerCase());
  return aliases.some((alias) => lowerConnected.includes(alias.toLowerCase()));
}

export function computeBenchmarks(
  currentMetrics: Record<string, number | string>,
  connectedSources: string[]
): BenchmarkReport {
  const comparisons: BenchmarkComparison[] = [];
  const sourcesUsed = new Set<string>();

  for (const def of BENCHMARK_DEFINITIONS) {
    // Only include benchmarks for connected sources with available data
    if (!isSourceConnected(def.requiredSource, connectedSources)) continue;

    const currentVal = extractNumeric(currentMetrics, def.key);
    if (currentVal === undefined) continue;

    const gap = pctChange(def.benchmarkValue, currentVal);

    let performance: "above" | "at" | "below";
    if (Math.abs(gap) < 5) {
      performance = "at";
    } else if (def.higherIsGood) {
      performance = currentVal > def.benchmarkValue ? "above" : "below";
    } else {
      performance = currentVal < def.benchmarkValue ? "above" : "below";
    }

    comparisons.push({
      metric: def.key,
      label: def.label,
      currentValue: Math.round(currentVal * 10) / 10,
      benchmarkValue: def.benchmarkValue,
      benchmarkLabel: def.benchmarkLabel,
      performance,
      gap: Math.round(gap * 10) / 10,
    });

    sourcesUsed.add(def.requiredSource);
  }

  // Determine overall performance
  const aboveCount = comparisons.filter((c) => c.performance === "above").length;
  const belowCount = comparisons.filter((c) => c.performance === "below").length;
  const total = comparisons.length;

  let overallPerformance: "above_average" | "average" | "below_average";
  if (total === 0) {
    overallPerformance = "average";
  } else if (aboveCount > total / 2) {
    overallPerformance = "above_average";
  } else if (belowCount > total / 2) {
    overallPerformance = "below_average";
  } else {
    overallPerformance = "average";
  }

  return {
    comparisons,
    overallPerformance,
    sourcesUsed: Array.from(sourcesUsed),
  };
}
