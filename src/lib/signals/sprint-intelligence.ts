// ─────────────────────────────────────────────────────────────
// Sprint Intelligence — Velocity forecasting & carry-over detection
// Analyzes Jira sprint data to predict completion and identify
// issues that repeatedly slip across sprints.
// ─────────────────────────────────────────────────────────────

import type { PriorContext } from "@/lib/ai/claude";
import type { JiraMetrics } from "@/lib/integrations/jira/metrics";

// ── Types ──

export interface SprintVelocityForecast {
  avgIssuesPerSprint: number;
  avgCompletionRate: number;
  currentSprintPlanned: number;
  predictedCompletion: number;
  predictedCompletionRate: number;
  confidence: "high" | "medium" | "low";
  sprintHistory: {
    name: string;
    planned: number;
    completed: number;
    rate: number;
  }[];
  recommendation: string;
}

export interface SprintCarryOverIssue {
  key: string;
  summary: string;
  sprintsPresent: number;
  assignee: string;
}

export interface SprintCarryOver {
  carryOverCount: number;
  carryOverIssues: SprintCarryOverIssue[];
  totalIssuesAnalyzed: number;
}

// ── Helpers ──

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Sprint Velocity Forecast ──

export function computeSprintVelocityForecast(
  jiraData: JiraMetrics,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _priorContexts: PriorContext[]
): SprintVelocityForecast | null {
  const { sprints } = jiraData;
  const closedSprints = sprints.recentClosed;

  // Need at least 1 closed sprint for any forecast
  if (closedSprints.length === 0) return null;

  // Build sprint history
  const sprintHistory = closedSprints.map((s) => ({
    name: s.name,
    planned: s.totalIssues,
    completed: s.completedIssues,
    rate: s.completionRate,
  }));

  // Rolling averages
  const avgIssuesPerSprint = round2(
    mean(closedSprints.map((s) => s.totalIssues))
  );
  const avgCompletionRate = round2(
    mean(closedSprints.map((s) => s.completionRate))
  );

  // Current sprint predictions
  const currentSprintPlanned = sprints.active?.totalIssues ?? 0;
  const predictedCompletion =
    currentSprintPlanned > 0
      ? Math.round((currentSprintPlanned * avgCompletionRate) / 100)
      : 0;
  const predictedCompletionRate =
    currentSprintPlanned > 0
      ? round2((predictedCompletion / currentSprintPlanned) * 100)
      : 0;

  // Confidence based on data points
  let confidence: "high" | "medium" | "low";
  if (closedSprints.length >= 3) {
    confidence = "high";
  } else if (closedSprints.length === 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Generate recommendation
  const recommendation = generateVelocityRecommendation(
    avgIssuesPerSprint,
    avgCompletionRate,
    currentSprintPlanned,
    confidence
  );

  return {
    avgIssuesPerSprint,
    avgCompletionRate,
    currentSprintPlanned,
    predictedCompletion,
    predictedCompletionRate,
    confidence,
    sprintHistory,
    recommendation,
  };
}

function generateVelocityRecommendation(
  avgIssues: number,
  avgRate: number,
  currentPlanned: number,
  confidence: "high" | "medium" | "low"
): string {
  const parts: string[] = [];

  // Target: recommend sprint size for 90% completion
  if (avgRate > 0) {
    const recommendedSize = Math.round((avgIssues * avgRate) / 90);
    parts.push(
      `Recommended sprint size: ${recommendedSize} issues to target a 90% completion rate.`
    );
  }

  // Warn if current sprint is overloaded
  if (currentPlanned > 0 && avgIssues > 0) {
    const loadRatio = currentPlanned / avgIssues;
    if (loadRatio > 1.3) {
      parts.push(
        `Current sprint has ${currentPlanned} issues, which is ${Math.round((loadRatio - 1) * 100)}% above your historical average of ${round2(avgIssues)}. Consider reducing scope.`
      );
    } else if (loadRatio < 0.7) {
      parts.push(
        `Current sprint has ${currentPlanned} issues, well below your average of ${round2(avgIssues)}. There may be room to take on more work.`
      );
    }
  }

  if (confidence === "low") {
    parts.push(
      "Forecast confidence is low — only 1 historical sprint available. Accuracy will improve with more data."
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Sprint velocity is consistent with historical patterns.";
}

// ── Sprint Carry-Over Detection ──

export function detectSprintCarryOver(
  jiraData: JiraMetrics,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _priorContexts: PriorContext[]
): SprintCarryOver | null {
  const { sprints } = jiraData;
  const activeSprint = sprints.active;

  if (!activeSprint || activeSprint.issueBreakdown.length === 0) {
    return null;
  }

  const activeIssues = activeSprint.issueBreakdown;
  const closedSprints = sprints.recentClosed;

  // Strategy: The recentClosed sprints don't carry issueBreakdown (only
  // summary counts), so we cannot do direct key-based comparison across
  // sprints. Instead, use a heuristic: issues in the active sprint that
  // are still in "To Do" / not-started status after the sprint is more
  // than 3 days old are likely carry-overs from a prior sprint.

  const sprintStartDate = activeSprint.startDate
    ? new Date(activeSprint.startDate)
    : null;
  const now = new Date();
  const sprintAgeDays = sprintStartDate
    ? (now.getTime() - sprintStartDate.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  // Only flag carry-overs if the sprint is at least 3 days old
  const sprintIsOldEnough = sprintAgeDays >= 3;

  // Known "not started" statuses (case-insensitive match)
  const notStartedStatuses = new Set([
    "to do",
    "open",
    "backlog",
    "new",
    "todo",
    "created",
  ]);

  const carryOverIssues: SprintCarryOverIssue[] = [];

  if (sprintIsOldEnough) {
    for (const issue of activeIssues) {
      const statusLower = issue.status.toLowerCase();
      if (notStartedStatuses.has(statusLower)) {
        // Estimate sprints present: if we have closed sprint data and the
        // sprint is old, assume the issue has been around for at least 2
        // sprints (current + at least 1 prior).
        const estimatedSprintsPresent = closedSprints.length > 0 ? 2 : 1;
        carryOverIssues.push({
          key: issue.key,
          summary: issue.summary,
          sprintsPresent: estimatedSprintsPresent,
          assignee: issue.assignee,
        });
      }
    }
  }

  return {
    carryOverCount: carryOverIssues.length,
    carryOverIssues,
    totalIssuesAnalyzed: activeIssues.length,
  };
}
