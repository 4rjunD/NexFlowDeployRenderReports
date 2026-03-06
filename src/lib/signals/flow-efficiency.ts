// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — Flow Efficiency Metrics
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";

interface FlowMetrics {
  cycleTime: number; // avg days from ticket_created to ticket_completed
  deployFrequency: number; // ci_run_completed (success) count per week
  wipLimitCompliance: number; // % of time WIP was within limit
  flowEfficiency: number; // active work time / total time * 100
}

interface EventRecord {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
}

interface TicketEvent {
  type: string;
  timestamp: Date;
  status?: string;
}

export async function computeFlowMetrics(
  orgId: string,
  periodDays: number = 30
): Promise<FlowMetrics> {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodDays);

  // Fetch events for the period
  const events: EventRecord[] = await prisma.event.findMany({
    where: {
      orgId,
      timestamp: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { timestamp: "asc" },
  });

  // ── Cycle Time ──
  // Average days from ticket_created to ticket_completed
  // Use cycleTimeDays from ticket_completed metadata if available
  const completedTickets = events.filter(
    (e: EventRecord) => e.type === "ticket_completed"
  );

  let totalCycleDays = 0;
  let cycleCount = 0;

  for (const ticket of completedTickets) {
    const metadata = ticket.metadata as Record<string, unknown>;
    if (typeof metadata?.cycleTimeDays === "number") {
      totalCycleDays += metadata.cycleTimeDays;
      cycleCount++;
    } else {
      // Try to find the corresponding ticket_created event
      const ticketKey = metadata?.ticketKey as string;
      if (ticketKey) {
        const created = events.find((e: EventRecord) => {
          if (e.type !== "ticket_created") return false;
          const cMeta = e.metadata as Record<string, unknown>;
          return cMeta?.ticketKey === ticketKey;
        });

        if (created) {
          const days =
            (ticket.timestamp.getTime() - created.timestamp.getTime()) /
            (1000 * 60 * 60 * 24);
          totalCycleDays += days;
          cycleCount++;
        }
      }
    }
  }

  const cycleTime =
    cycleCount > 0
      ? Math.round((totalCycleDays / cycleCount) * 10) / 10
      : 0;

  // ── Deploy Frequency ──
  // Successful CI runs per week
  const successfulDeploys = events.filter((e: EventRecord) => {
    if (e.type !== "ci_run_completed") return false;
    const metadata = e.metadata as Record<string, unknown>;
    return metadata?.conclusion === "success";
  }).length;

  const weeks = periodDays / 7;
  const deployFrequency =
    weeks > 0
      ? Math.round((successfulDeploys / weeks) * 10) / 10
      : 0;

  // ── WIP Limit Compliance ──
  // Estimate from concurrent in-progress tickets over time
  // Group events by day, count concurrent in-progress tickets
  const wipLimit = 5; // default WIP limit per team
  const dayBuckets = new Map<string, Set<string>>();

  // Track ticket states over time
  const ticketStates = new Map<string, string>();

  for (const e of events) {
    const dayKey = e.timestamp.toISOString().split("T")[0];
    const metadata = e.metadata as Record<string, unknown>;
    const ticketKey = metadata?.ticketKey as string;

    if (!ticketKey) continue;

    if (e.type === "ticket_updated" || e.type === "ticket_created") {
      const status = metadata?.status as string;
      if (status) {
        ticketStates.set(ticketKey, status);
      }
    }

    if (e.type === "ticket_completed") {
      ticketStates.set(ticketKey, "done");
    }

    // Count in-progress tickets for this day
    if (!dayBuckets.has(dayKey)) {
      dayBuckets.set(dayKey, new Set());
    }

    // Add all currently in-progress tickets to this day
    const stateEntries = Array.from(ticketStates.entries());
    for (let i = 0; i < stateEntries.length; i++) {
      const key = stateEntries[i][0];
      const state = stateEntries[i][1];
      if (state === "in_progress") {
        dayBuckets.get(dayKey)!.add(key);
      }
    }
  }

  let daysWithinLimit = 0;
  const totalDays = dayBuckets.size;

  const bucketEntries = Array.from(dayBuckets.entries());
  for (let i = 0; i < bucketEntries.length; i++) {
    const inProgressTickets = bucketEntries[i][1];
    if (inProgressTickets.size <= wipLimit) {
      daysWithinLimit++;
    }
  }

  const wipLimitCompliance =
    totalDays > 0
      ? Math.round((daysWithinLimit / totalDays) * 100)
      : 100; // Default to 100% if no data

  // ── Flow Efficiency ──
  // Active work time / total time * 100
  // Estimate from event patterns: time between ticket status transitions
  // "Active" = time in "in_progress" state, "Total" = time from created to completed
  let totalActiveHours = 0;
  let totalTotalHours = 0;

  // Group events by ticket key
  const ticketEvents = new Map<string, TicketEvent[]>();

  for (const e of events) {
    const metadata = e.metadata as Record<string, unknown>;
    const ticketKey = metadata?.ticketKey as string;
    if (!ticketKey) continue;

    if (!ticketEvents.has(ticketKey)) {
      ticketEvents.set(ticketKey, []);
    }

    ticketEvents.get(ticketKey)!.push({
      type: e.type,
      timestamp: e.timestamp,
      status: metadata?.status as string | undefined,
    });
  }

  const ticketEntries = Array.from(ticketEvents.entries());
  for (let i = 0; i < ticketEntries.length; i++) {
    const evts = ticketEntries[i][1];
    // Sort by timestamp
    evts.sort(
      (a: TicketEvent, b: TicketEvent) =>
        a.timestamp.getTime() - b.timestamp.getTime()
    );

    const created = evts.find(
      (e: TicketEvent) => e.type === "ticket_created"
    );
    const completed = evts.find(
      (e: TicketEvent) => e.type === "ticket_completed"
    );

    if (!created || !completed) continue;

    const totalHours =
      (completed.timestamp.getTime() - created.timestamp.getTime()) /
      (1000 * 60 * 60);

    // Estimate active time: time spent in "in_progress" status
    let activeHours = 0;
    let inProgressStart: Date | null = null;

    for (const evt of evts) {
      if (evt.status === "in_progress" && !inProgressStart) {
        inProgressStart = evt.timestamp;
      } else if (
        inProgressStart &&
        evt.status &&
        evt.status !== "in_progress"
      ) {
        activeHours +=
          (evt.timestamp.getTime() - inProgressStart.getTime()) /
          (1000 * 60 * 60);
        inProgressStart = null;
      }
    }

    // If still in progress at completion, count it
    if (inProgressStart) {
      activeHours +=
        (completed.timestamp.getTime() - inProgressStart.getTime()) /
        (1000 * 60 * 60);
    }

    // If no status transitions were tracked, estimate 60% as active
    if (activeHours === 0 && totalHours > 0) {
      activeHours = totalHours * 0.6;
    }

    totalActiveHours += activeHours;
    totalTotalHours += totalHours;
  }

  const flowEfficiency =
    totalTotalHours > 0
      ? Math.round((totalActiveHours / totalTotalHours) * 100)
      : 0;

  return {
    cycleTime,
    deployFrequency,
    wipLimitCompliance,
    flowEfficiency,
  };
}
