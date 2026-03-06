// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — Monthly Health Report
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";

interface MonthlyMetrics {
  velocity: number; // tickets completed per week
  avgCycleTime: number; // average days from ticket_created to ticket_completed
  prMergeRate: number; // PRs merged / PRs opened * 100
  bugEscapeRate: number; // bug tickets / total tickets * 100
}

interface TrendComparison {
  current: number;
  previous: number;
  changePercent: number;
  direction: "up" | "down" | "stable";
}

interface HealthScores {
  delivery: number; // 0-100
  quality: number; // 0-100
  collaboration: number; // 0-100
  sustainability: number; // 0-100
}

interface TeamContribution {
  userId: string;
  name: string;
  commits: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  ticketsCompleted: number;
}

interface MonthlyHealthReport {
  periodStart: Date;
  periodEnd: Date;
  metrics: MonthlyMetrics;
  trends: {
    velocity: TrendComparison;
    cycleTime: TrendComparison;
    prMergeRate: TrendComparison;
    bugEscapeRate: TrendComparison;
  };
  healthScores: HealthScores;
  teamContributions: TeamContribution[];
  summary: {
    totalPrsMerged: number;
    totalCommits: number;
    totalTicketsCompleted: number;
    totalDeployments: number;
    totalReviews: number;
  };
}

interface EventWithUser {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
  userId: string | null;
  user: { id: string; name: string | null } | null;
}

interface EventRecord {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
}

function computeTrend(current: number, previous: number): TrendComparison {
  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current > 0 ? 100 : 0,
      direction: current > 0 ? "up" : "stable",
    };
  }
  const changePercent =
    Math.round(((current - previous) / previous) * 100 * 10) / 10;
  const direction: "up" | "down" | "stable" =
    Math.abs(changePercent) < 5
      ? "stable"
      : changePercent > 0
        ? "up"
        : "down";
  return { current, previous, changePercent, direction };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function generateMonthlyHealth(
  orgId: string,
  teamId?: string
): Promise<MonthlyHealthReport> {
  // 1. Period: last 30 days
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 30);

  // Previous period for trend comparison
  const prevPeriodEnd = new Date(periodStart);
  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - 30);

  // Build where clause
  const buildWhereClause = (start: Date, end: Date) => {
    const where: Record<string, unknown> = {
      orgId,
      timestamp: { gte: start, lte: end },
    };
    return where;
  };

  // If teamId is provided, filter by team members
  let teamMemberIds: string[] | undefined;
  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { select: { id: true } } },
    });
    if (team) {
      teamMemberIds = team.members.map((m: { id: string }) => m.id);
    }
  }

  const addTeamFilter = (where: Record<string, unknown>) => {
    if (teamMemberIds) {
      where.userId = { in: teamMemberIds };
    }
    return where;
  };

  // 2. Query events for current and previous periods
  const currentEvents: EventWithUser[] = await prisma.event.findMany({
    where: addTeamFilter(buildWhereClause(periodStart, periodEnd)),
    include: { user: { select: { id: true, name: true } } },
    orderBy: { timestamp: "desc" },
  });

  const previousEvents: EventRecord[] = await prisma.event.findMany({
    where: addTeamFilter(buildWhereClause(prevPeriodStart, prevPeriodEnd)),
    orderBy: { timestamp: "desc" },
  });

  // Helper to compute metrics from events
  const computeMetricsFromEvents = (
    events: EventRecord[]
  ): MonthlyMetrics => {
    const ticketsCompleted = events.filter(
      (e: EventRecord) => e.type === "ticket_completed"
    ).length;
    const ticketsCreated = events.filter(
      (e: EventRecord) => e.type === "ticket_created"
    ).length;
    const prsOpened = events.filter(
      (e: EventRecord) => e.type === "pr_opened"
    ).length;
    const prsMerged = events.filter(
      (e: EventRecord) => e.type === "pr_merged"
    ).length;

    // Velocity: tickets completed per week (30 days ~ 4.3 weeks)
    const weeks = 30 / 7;
    const velocity = Math.round((ticketsCompleted / weeks) * 10) / 10;

    // Avg cycle time from ticket metadata
    const completedTickets = events.filter(
      (e: EventRecord) => e.type === "ticket_completed"
    );
    let avgCycleTime = 0;
    if (completedTickets.length > 0) {
      const totalCycleDays = completedTickets.reduce(
        (sum: number, e: EventRecord) => {
          const metadata = e.metadata as Record<string, unknown>;
          const cycleDays =
            typeof metadata?.cycleTimeDays === "number"
              ? metadata.cycleTimeDays
              : 5; // estimate
          return sum + cycleDays;
        },
        0
      );
      avgCycleTime =
        Math.round((totalCycleDays / completedTickets.length) * 10) / 10;
    }

    // PR merge rate
    const prMergeRate =
      prsOpened > 0 ? Math.round((prsMerged / prsOpened) * 100) : 0;

    // Bug escape rate: bug-type tickets / total tickets
    const bugTickets = events.filter((e: EventRecord) => {
      if (e.type !== "ticket_created") return false;
      const metadata = e.metadata as Record<string, unknown>;
      return metadata?.issueType === "Bug";
    }).length;
    const bugEscapeRate =
      ticketsCreated > 0
        ? Math.round((bugTickets / ticketsCreated) * 100)
        : 0;

    return { velocity, avgCycleTime, prMergeRate, bugEscapeRate };
  };

  // 3. Compute monthly metrics
  const currentMetrics = computeMetricsFromEvents(currentEvents);
  const previousMetrics = computeMetricsFromEvents(previousEvents);

  // 4. Compute trends
  const trends = {
    velocity: computeTrend(currentMetrics.velocity, previousMetrics.velocity),
    cycleTime: computeTrend(
      currentMetrics.avgCycleTime,
      previousMetrics.avgCycleTime
    ),
    prMergeRate: computeTrend(
      currentMetrics.prMergeRate,
      previousMetrics.prMergeRate
    ),
    bugEscapeRate: computeTrend(
      currentMetrics.bugEscapeRate,
      previousMetrics.bugEscapeRate
    ),
  };

  // 5. Compute health scores (0-100)
  // Delivery score: based on velocity and cycle time
  const deliveryScore = clamp(
    Math.round(
      (currentMetrics.velocity / Math.max(previousMetrics.velocity, 1)) *
        50 +
        (currentMetrics.avgCycleTime > 0
          ? Math.max(0, 50 - (currentMetrics.avgCycleTime - 3) * 10)
          : 50)
    ),
    0,
    100
  );

  // Quality score: based on PR merge rate and bug escape rate
  const qualityScore = clamp(
    Math.round(
      currentMetrics.prMergeRate * 0.6 +
        (100 - currentMetrics.bugEscapeRate) * 0.4
    ),
    0,
    100
  );

  // Collaboration score: based on review activity and distribution
  const totalReviews = currentEvents.filter(
    (e: EventWithUser) => e.type === "pr_review_submitted"
  ).length;
  const uniqueReviewers = new Set(
    currentEvents
      .filter((e: EventWithUser) => e.type === "pr_review_submitted")
      .map((e: EventWithUser) => e.userId)
      .filter(Boolean)
  ).size;
  const collaborationScore = clamp(
    Math.round(
      Math.min(totalReviews * 3, 60) + Math.min(uniqueReviewers * 10, 40)
    ),
    0,
    100
  );

  // Sustainability score: based on deploy frequency and CI success
  const successfulDeploys = currentEvents.filter(
    (e: EventWithUser) => {
      if (e.type !== "ci_run_completed") return false;
      const metadata = e.metadata as Record<string, unknown>;
      return metadata?.conclusion === "success";
    }
  ).length;
  const totalCIRuns = currentEvents.filter(
    (e: EventWithUser) => e.type === "ci_run_completed"
  ).length;
  const ciSuccessRate =
    totalCIRuns > 0
      ? Math.round((successfulDeploys / totalCIRuns) * 100)
      : 50;
  const sustainabilityScore = clamp(
    Math.round(ciSuccessRate * 0.6 + Math.min(successfulDeploys * 2, 40)),
    0,
    100
  );

  const healthScores: HealthScores = {
    delivery: deliveryScore,
    quality: qualityScore,
    collaboration: collaborationScore,
    sustainability: sustainabilityScore,
  };

  // Compute team contributions
  const contributionMap = new Map<string, TeamContribution>();

  for (const e of currentEvents) {
    if (!e.user) continue;
    const userId = e.user.id;
    if (!contributionMap.has(userId)) {
      contributionMap.set(userId, {
        userId,
        name: e.user.name || "Unknown",
        commits: 0,
        prsOpened: 0,
        prsMerged: 0,
        reviews: 0,
        ticketsCompleted: 0,
      });
    }
    const contrib = contributionMap.get(userId)!;

    switch (e.type) {
      case "commit_pushed":
        contrib.commits++;
        break;
      case "pr_opened":
        contrib.prsOpened++;
        break;
      case "pr_merged":
        contrib.prsMerged++;
        break;
      case "pr_review_submitted":
        contrib.reviews++;
        break;
      case "ticket_completed":
        contrib.ticketsCompleted++;
        break;
    }
  }

  const teamContributions = Array.from(contributionMap.values()).sort(
    (a: TeamContribution, b: TeamContribution) =>
      b.commits +
      b.prsOpened +
      b.reviews -
      (a.commits + a.prsOpened + a.reviews)
  );

  // Summary totals
  const summary = {
    totalPrsMerged: currentEvents.filter(
      (e: EventWithUser) => e.type === "pr_merged"
    ).length,
    totalCommits: currentEvents.filter(
      (e: EventWithUser) => e.type === "commit_pushed"
    ).length,
    totalTicketsCompleted: currentEvents.filter(
      (e: EventWithUser) => e.type === "ticket_completed"
    ).length,
    totalDeployments: successfulDeploys,
    totalReviews,
  };

  return {
    periodStart,
    periodEnd,
    metrics: currentMetrics,
    trends,
    healthScores,
    teamContributions,
    summary,
  };
}
