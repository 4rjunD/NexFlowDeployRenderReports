// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — Sprint Risk Calculator
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";

interface WeightedSignal {
  name: string;
  value: number;
  weight: number;
}

/**
 * Computes a weighted average risk score from an array of signals.
 * Result is clamped to the range [0, 100].
 */
export function calculateSprintRisk(signals: WeightedSignal[]): number {
  if (signals.length === 0) return 0;

  const totalWeight = signals.reduce(
    (sum: number, s: WeightedSignal) => sum + s.weight,
    0
  );
  if (totalWeight === 0) return 0;

  const weightedSum = signals.reduce(
    (sum: number, s: WeightedSignal) => sum + s.value * s.weight,
    0
  );
  const score = weightedSum / totalWeight;

  // Clamp to 0-100
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

interface ComputedSignal {
  name: string;
  category: string;
  value: number;
  weight: number;
  metadata: Record<string, unknown>;
}

interface EventRecord {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
}

/**
 * Computes the 8 sprint risk signals from event data for a given sprint.
 */
export async function computeRiskSignals(
  orgId: string,
  sprintId: string
): Promise<ComputedSignal[]> {
  // Fetch the sprint
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
  });

  const startDate = new Date(sprint.startDate);
  const endDate = new Date(sprint.endDate);
  const now = new Date();
  const effectiveEnd = now < endDate ? now : endDate;

  // Fetch events for the sprint period
  const events: EventRecord[] = await prisma.event.findMany({
    where: {
      orgId,
      timestamp: {
        gte: startDate,
        lte: effectiveEnd,
      },
    },
    orderBy: { timestamp: "asc" },
  });

  const sprintMidpoint = new Date(
    startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2
  );

  // Sprint metadata
  const sprintMeta = sprint.metadata as Record<string, unknown>;
  const totalPoints =
    typeof sprintMeta?.totalPoints === "number" ? sprintMeta.totalPoints : 0;
  const completedPoints =
    typeof sprintMeta?.completedPoints === "number"
      ? sprintMeta.completedPoints
      : 0;

  // ── Signal 1: Scope Creep Index ──
  // New tickets added after sprint start / total tickets * 100
  const ticketsCreated = events.filter(
    (e: EventRecord) => e.type === "ticket_created"
  );
  const ticketsCreatedAfterStart = ticketsCreated.filter(
    (e: EventRecord) => e.timestamp > startDate
  );
  const totalTickets = Math.max(1, ticketsCreated.length);
  const scopeCreepIndex = Math.min(
    100,
    Math.round((ticketsCreatedAfterStart.length / totalTickets) * 100)
  );

  // ── Signal 2: Velocity Deviation ──
  // |actual velocity - planned velocity| / planned velocity * 100
  const plannedVelocity = totalPoints > 0 ? totalPoints : 30; // fallback
  const actualVelocity = completedPoints;
  const velocityDeviation =
    plannedVelocity > 0
      ? Math.min(
          100,
          Math.round(
            (Math.abs(actualVelocity - plannedVelocity) / plannedVelocity) *
              100
          )
        )
      : 0;

  // ── Signal 3: Blocker Density ──
  // Blocked tickets / total tickets * 100
  const blockedTickets = events.filter((e: EventRecord) => {
    if (e.type !== "ticket_updated") return false;
    const metadata = e.metadata as Record<string, unknown>;
    return metadata?.status === "blocked";
  });
  // Deduplicate by ticket key
  const uniqueBlockedTickets = new Set(
    blockedTickets.map((e: EventRecord) => {
      const metadata = e.metadata as Record<string, unknown>;
      return metadata?.ticketKey as string;
    })
  ).size;
  const blockerDensity = Math.min(
    100,
    Math.round((uniqueBlockedTickets / totalTickets) * 100)
  );

  // ── Signal 4: Late Start Rate ──
  // Tickets started after 50% of sprint time / total tickets * 100
  const ticketsStartedLate = events.filter((e: EventRecord) => {
    if (e.type !== "ticket_updated") return false;
    const metadata = e.metadata as Record<string, unknown>;
    return (
      metadata?.status === "in_progress" &&
      metadata?.previousStatus === "to_do" &&
      e.timestamp > sprintMidpoint
    );
  });
  const lateStartRate = Math.min(
    100,
    Math.round((ticketsStartedLate.length / totalTickets) * 100)
  );

  // ── Signal 5: PR Review Bottleneck ──
  // PRs waiting > 24h for review / total PRs * 100
  const prOpenedEvents = events.filter(
    (e: EventRecord) => e.type === "pr_opened"
  );
  const prReviewEvents = events.filter(
    (e: EventRecord) => e.type === "pr_review_submitted"
  );

  let prsWaitingLong = 0;
  for (const prOpen of prOpenedEvents) {
    const prMeta = prOpen.metadata as Record<string, unknown>;
    const prNumber = prMeta?.prNumber;
    const firstReview = prReviewEvents.find((r: EventRecord) => {
      const rMeta = r.metadata as Record<string, unknown>;
      return (
        rMeta?.prNumber === prNumber && r.timestamp > prOpen.timestamp
      );
    });

    if (!firstReview) {
      // No review yet — check if it's been > 24h
      const hoursSinceOpen =
        (effectiveEnd.getTime() - prOpen.timestamp.getTime()) /
        (1000 * 60 * 60);
      if (hoursSinceOpen > 24) {
        prsWaitingLong++;
      }
    } else {
      const hoursToReview =
        (firstReview.timestamp.getTime() - prOpen.timestamp.getTime()) /
        (1000 * 60 * 60);
      if (hoursToReview > 24) {
        prsWaitingLong++;
      }
    }
  }
  const totalPRs = Math.max(1, prOpenedEvents.length);
  const prReviewBottleneck = Math.min(
    100,
    Math.round((prsWaitingLong / totalPRs) * 100)
  );

  // ── Signal 6: CI Failure Rate ──
  // Failed CI runs / total CI runs * 100
  const ciRuns = events.filter(
    (e: EventRecord) => e.type === "ci_run_completed"
  );
  const failedCIRuns = ciRuns.filter((e: EventRecord) => {
    const metadata = e.metadata as Record<string, unknown>;
    return metadata?.conclusion === "failure";
  });
  const totalCIRuns = Math.max(1, ciRuns.length);
  const ciFailureRate = Math.min(
    100,
    Math.round((failedCIRuns.length / totalCIRuns) * 100)
  );

  // ── Signal 7: Meeting Load ──
  // Estimated meeting hours / total available hours * 100
  // Estimate: ~2h of meetings per developer per day as baseline (from calendar events if available)
  const sprintDaysElapsed = Math.max(
    1,
    Math.ceil(
      (effectiveEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  // Estimate meeting hours from metadata if available, otherwise use defaults
  const estimatedMeetingHoursPerDay = 2.5; // average estimate
  const availableHoursPerDay = 8;
  const meetingLoad = Math.min(
    100,
    Math.round(
      (estimatedMeetingHoursPerDay / availableHoursPerDay) * 100
    )
  );

  // ── Signal 8: Context Switching ──
  // Tickets with > 3 status changes / total tickets * 100
  const ticketUpdateCounts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "ticket_updated") continue;
    const metadata = e.metadata as Record<string, unknown>;
    const ticketKey = metadata?.ticketKey as string;
    if (ticketKey) {
      ticketUpdateCounts.set(
        ticketKey,
        (ticketUpdateCounts.get(ticketKey) || 0) + 1
      );
    }
  }
  const highChurnTickets = Array.from(ticketUpdateCounts.values()).filter(
    (count: number) => count > 3
  ).length;
  const contextSwitching = Math.min(
    100,
    Math.round((highChurnTickets / totalTickets) * 100)
  );

  return [
    {
      name: "Scope Creep Index",
      category: "sprint_risk",
      value: scopeCreepIndex,
      weight: 1.5,
      metadata: {
        description: "Measures scope additions after sprint start",
        ticketsAdded: ticketsCreatedAfterStart.length,
        originalScope: totalTickets - ticketsCreatedAfterStart.length,
      },
    },
    {
      name: "Velocity Deviation",
      category: "sprint_risk",
      value: velocityDeviation,
      weight: 1.2,
      metadata: {
        description: "Deviation from planned sprint velocity",
        plannedVelocity,
        actualVelocity,
      },
    },
    {
      name: "Blocker Density",
      category: "sprint_risk",
      value: blockerDensity,
      weight: 1.8,
      metadata: {
        description: "Percentage of tickets with active blockers",
        blockedTickets: uniqueBlockedTickets,
        totalTickets,
      },
    },
    {
      name: "Late Start Rate",
      category: "sprint_risk",
      value: lateStartRate,
      weight: 1.0,
      metadata: {
        description: "Percentage of tickets not started by mid-sprint",
        lateTickets: ticketsStartedLate.length,
        totalTickets,
      },
    },
    {
      name: "PR Review Bottleneck",
      category: "sprint_risk",
      value: prReviewBottleneck,
      weight: 1.3,
      metadata: {
        description: "PRs waiting for review > 24 hours",
        prsWaitingLong,
        totalPRs,
      },
    },
    {
      name: "CI Failure Rate",
      category: "sprint_risk",
      value: ciFailureRate,
      weight: 0.8,
      metadata: {
        description: "Percentage of CI runs failing",
        failedRuns: failedCIRuns.length,
        totalRuns: ciRuns.length,
      },
    },
    {
      name: "Meeting Load",
      category: "sprint_risk",
      value: meetingLoad,
      weight: 0.7,
      metadata: {
        description:
          "Estimated meeting hours as percentage of available hours",
        estimatedMeetingHoursPerDay,
        availableHoursPerDay,
        sprintDaysElapsed,
      },
    },
    {
      name: "Context Switching",
      category: "sprint_risk",
      value: contextSwitching,
      weight: 1.1,
      metadata: {
        description: "Tickets with > 3 status changes / total tickets",
        highChurnTickets,
        totalTickets,
      },
    },
  ];
}
