// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — Weekly Digest Report
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";

interface WeeklyMetrics {
  prsOpened: number;
  prsMerged: number;
  prReviewsSubmitted: number;
  ticketsCreated: number;
  ticketsCompleted: number;
  commitsPushed: number;
  avgReviewCycleHours: number;
  deployments: number;
}

interface TeamMemberActivity {
  userId: string;
  name: string;
  prs: number;
  reviews: number;
  commits: number;
}

interface WeeklyDigest {
  periodStart: Date;
  periodEnd: Date;
  metrics: WeeklyMetrics;
  highlights: string[];
  teamActivity: TeamMemberActivity[];
}

interface EventWithUser {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
  userId: string | null;
  user: { id: string; name: string | null } | null;
}

export async function generateWeeklyDigest(
  orgId: string,
  teamId?: string
): Promise<WeeklyDigest> {
  // 1. Compute period: last 7 days
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 7);

  // 2. Query events for the org/team in the period
  const whereClause: Record<string, unknown> = {
    orgId,
    timestamp: {
      gte: periodStart,
      lte: periodEnd,
    },
  };

  // If teamId is provided, filter by team members
  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { members: { select: { id: true } } },
    });
    if (team) {
      const teamMemberIds = team.members.map(
        (m: { id: string }) => m.id
      );
      whereClause.userId = { in: teamMemberIds };
    }
  }

  const events: EventWithUser[] = await prisma.event.findMany({
    where: whereClause,
    include: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { timestamp: "desc" },
  });

  // 3. Compute metrics
  const prsOpened = events.filter(
    (e: EventWithUser) => e.type === "pr_opened"
  ).length;
  const prsMerged = events.filter(
    (e: EventWithUser) => e.type === "pr_merged"
  ).length;
  const prReviewsSubmitted = events.filter(
    (e: EventWithUser) => e.type === "pr_review_submitted"
  ).length;
  const ticketsCreated = events.filter(
    (e: EventWithUser) => e.type === "ticket_created"
  ).length;
  const ticketsCompleted = events.filter(
    (e: EventWithUser) => e.type === "ticket_completed"
  ).length;
  const commitsPushed = events.filter(
    (e: EventWithUser) => e.type === "commit_pushed"
  ).length;

  // Compute avg review cycle hours from PR metadata if available
  const mergedPRs = events.filter(
    (e: EventWithUser) => e.type === "pr_merged"
  );
  let avgReviewCycleHours = 0;
  if (mergedPRs.length > 0) {
    const totalHours = mergedPRs.reduce(
      (sum: number, e: EventWithUser) => {
        const metadata = e.metadata as Record<string, unknown>;
        const hours =
          typeof metadata?.timeToMergeHours === "number"
            ? metadata.timeToMergeHours
            : 24; // estimate if not available
        return sum + hours;
      },
      0
    );
    avgReviewCycleHours =
      Math.round((totalHours / mergedPRs.length) * 10) / 10;
  }

  // Deployments: count ci_run_completed with success conclusion
  const deployments = events.filter((e: EventWithUser) => {
    if (e.type !== "ci_run_completed") return false;
    const metadata = e.metadata as Record<string, unknown>;
    return metadata?.conclusion === "success";
  }).length;

  const metrics: WeeklyMetrics = {
    prsOpened,
    prsMerged,
    prReviewsSubmitted,
    ticketsCreated,
    ticketsCompleted,
    commitsPushed,
    avgReviewCycleHours,
    deployments,
  };

  // 4. Compute highlights
  const highlights: string[] = [];

  // Per-user PR merge counts for highlights
  const prMergesByUser = new Map<string, { name: string; count: number }>();
  for (const e of mergedPRs) {
    if (e.user) {
      const existing = prMergesByUser.get(e.user.id);
      if (existing) {
        existing.count++;
      } else {
        prMergesByUser.set(e.user.id, {
          name: e.user.name || "Unknown",
          count: 1,
        });
      }
    }
  }

  // Find top PR merger
  let topMerger: { name: string; count: number } | null = null;
  const mergerEntries = Array.from(prMergesByUser.values());
  for (const entry of mergerEntries) {
    if (!topMerger || entry.count > topMerger.count) {
      topMerger = entry;
    }
  }
  if (topMerger && topMerger.count > 1) {
    highlights.push(
      `${topMerger.name} merged ${topMerger.count} PRs this week`
    );
  }

  // Review activity highlight
  if (prReviewsSubmitted > 10) {
    highlights.push(
      `${prReviewsSubmitted} code reviews submitted — strong collaboration`
    );
  }

  // Deployment highlight
  if (deployments > 0) {
    highlights.push(`${deployments} successful deployments this week`);
  }

  // Ticket completion highlight
  if (ticketsCompleted > 0) {
    highlights.push(`${ticketsCompleted} tickets completed this week`);
  }

  // Cycle time highlight
  if (avgReviewCycleHours > 0 && avgReviewCycleHours < 12) {
    highlights.push(
      `Average PR review cycle time is ${avgReviewCycleHours}h — below 12h target`
    );
  } else if (avgReviewCycleHours >= 24) {
    highlights.push(
      `Average PR review cycle time is ${avgReviewCycleHours}h — above 24h threshold`
    );
  }

  // 5. Compute team activity (per-user breakdown)
  const activityMap = new Map<
    string,
    { userId: string; name: string; prs: number; reviews: number; commits: number }
  >();

  for (const e of events) {
    if (!e.user) continue;
    const userId = e.user.id;
    if (!activityMap.has(userId)) {
      activityMap.set(userId, {
        userId,
        name: e.user.name || "Unknown",
        prs: 0,
        reviews: 0,
        commits: 0,
      });
    }
    const activity = activityMap.get(userId)!;

    if (e.type === "pr_opened" || e.type === "pr_merged") {
      activity.prs++;
    } else if (e.type === "pr_review_submitted") {
      activity.reviews++;
    } else if (e.type === "commit_pushed") {
      activity.commits++;
    }
  }

  const teamActivity: TeamMemberActivity[] = Array.from(
    activityMap.values()
  ).sort(
    (a: TeamMemberActivity, b: TeamMemberActivity) =>
      b.prs + b.reviews + b.commits - (a.prs + a.reviews + a.commits)
  );

  // 6. Return structured object
  return {
    periodStart,
    periodEnd,
    metrics,
    highlights,
    teamActivity,
  };
}
