// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — PR Health Metrics
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";

interface PRHealthMetrics {
  avgPickupTime: number; // avg hours between pr_opened and first pr_review_submitted
  avgReviewCycle: number; // avg hours between pr_opened and pr_merged
  firstPassApprovalRate: number; // PRs merged with <=1 review round / total merged * 100
  reviewerLoadBalance: number; // coefficient of variation of reviews per reviewer
}

interface EventRecord {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
  userId: string | null;
}

export async function computePRHealthMetrics(
  orgId: string,
  periodDays: number = 30
): Promise<PRHealthMetrics> {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodDays);

  // Fetch PR events for the period
  const events: EventRecord[] = await prisma.event.findMany({
    where: {
      orgId,
      timestamp: { gte: periodStart, lte: periodEnd },
      type: { in: ["pr_opened", "pr_merged", "pr_review_submitted"] },
    },
    orderBy: { timestamp: "asc" },
  });

  const prOpened = events.filter(
    (e: EventRecord) => e.type === "pr_opened"
  );
  const prMerged = events.filter(
    (e: EventRecord) => e.type === "pr_merged"
  );
  const prReviews = events.filter(
    (e: EventRecord) => e.type === "pr_review_submitted"
  );

  // ── Avg Pickup Time ──
  // Average hours between pr_opened and first pr_review_submitted (by PR number)
  let totalPickupHours = 0;
  let pickupCount = 0;

  for (const opened of prOpened) {
    const openMeta = opened.metadata as Record<string, unknown>;
    const prNumber = openMeta?.prNumber;
    if (prNumber == null) continue;

    // Find the first review for this PR
    const firstReview = prReviews.find((r: EventRecord) => {
      const rMeta = r.metadata as Record<string, unknown>;
      return rMeta?.prNumber === prNumber && r.timestamp > opened.timestamp;
    });

    if (firstReview) {
      const hours =
        (firstReview.timestamp.getTime() - opened.timestamp.getTime()) /
        (1000 * 60 * 60);
      totalPickupHours += hours;
      pickupCount++;
    }
  }

  const avgPickupTime =
    pickupCount > 0
      ? Math.round((totalPickupHours / pickupCount) * 10) / 10
      : 0;

  // ── Avg Review Cycle ──
  // Average hours between pr_opened and pr_merged
  let totalCycleHours = 0;
  let cycleCount = 0;

  for (const merged of prMerged) {
    const mergeMeta = merged.metadata as Record<string, unknown>;
    // Use timeToMergeHours from metadata if available
    if (typeof mergeMeta?.timeToMergeHours === "number") {
      totalCycleHours += mergeMeta.timeToMergeHours;
      cycleCount++;
    } else {
      // Try to find the corresponding pr_opened event
      const prNumber = mergeMeta?.prNumber;
      if (prNumber == null) continue;

      const opened = prOpened.find((o: EventRecord) => {
        const oMeta = o.metadata as Record<string, unknown>;
        return oMeta?.prNumber === prNumber;
      });

      if (opened) {
        const hours =
          (merged.timestamp.getTime() - opened.timestamp.getTime()) /
          (1000 * 60 * 60);
        totalCycleHours += hours;
        cycleCount++;
      }
    }
  }

  const avgReviewCycle =
    cycleCount > 0
      ? Math.round((totalCycleHours / cycleCount) * 10) / 10
      : 0;

  // ── First Pass Approval Rate ──
  // PRs merged with <= 1 review round / total merged * 100
  let firstPassCount = 0;

  for (const merged of prMerged) {
    const mergeMeta = merged.metadata as Record<string, unknown>;
    const prNumber = mergeMeta?.prNumber;
    if (prNumber == null) continue;

    // Count review rounds for this PR (CHANGES_REQUESTED indicates additional rounds)
    const reviewsForPR = prReviews.filter((r: EventRecord) => {
      const rMeta = r.metadata as Record<string, unknown>;
      return rMeta?.prNumber === prNumber;
    });

    const changesRequested = reviewsForPR.filter((r: EventRecord) => {
      const rMeta = r.metadata as Record<string, unknown>;
      return rMeta?.state === "CHANGES_REQUESTED";
    });

    // If no changes were requested, it was approved on first pass
    if (changesRequested.length === 0) {
      firstPassCount++;
    }
  }

  const totalMerged = Math.max(1, prMerged.length);
  const firstPassApprovalRate = Math.round(
    (firstPassCount / totalMerged) * 100
  );

  // ── Reviewer Load Balance ──
  // Coefficient of variation of reviews per reviewer (lower = more balanced)
  const reviewsByReviewer = new Map<string, number>();

  for (const review of prReviews) {
    const rMeta = review.metadata as Record<string, unknown>;
    const reviewer =
      (rMeta?.reviewer as string) || review.userId || "unknown";
    reviewsByReviewer.set(
      reviewer,
      (reviewsByReviewer.get(reviewer) || 0) + 1
    );
  }

  let reviewerLoadBalance = 0;
  if (reviewsByReviewer.size > 1) {
    const counts = Array.from(reviewsByReviewer.values());
    const mean =
      counts.reduce((a: number, b: number) => a + b, 0) / counts.length;
    const variance =
      counts.reduce(
        (sum: number, c: number) => sum + Math.pow(c - mean, 2),
        0
      ) / counts.length;
    const stdDev = Math.sqrt(variance);
    // Coefficient of variation as percentage
    reviewerLoadBalance =
      mean > 0 ? Math.round((stdDev / mean) * 100) : 0;
  }

  return {
    avgPickupTime,
    avgReviewCycle,
    firstPassApprovalRate,
    reviewerLoadBalance,
  };
}
