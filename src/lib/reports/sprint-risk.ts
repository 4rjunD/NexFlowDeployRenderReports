// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — Sprint Risk Report
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";
import { calculateSprintRisk } from "@/lib/signals/risk-calculator";

interface SprintInfo {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
  riskScore: number;
  metadata: unknown;
}

interface RiskSignal {
  name: string;
  category: string;
  value: number;
  weight: number;
  trend: string;
  metadata: unknown;
}

interface SprintProgress {
  percentTimeElapsed: number;
  percentWorkDone: number;
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
}

interface SprintRiskReport {
  sprint: SprintInfo;
  riskScore: number;
  signals: RiskSignal[];
  progress: SprintProgress;
  recommendations: string[];
}

interface SignalRecord {
  name: string;
  category: string;
  value: number;
  weight: number;
  trend: string;
  metadata: unknown;
}

interface EventRecord {
  id: string;
  type: string;
  metadata: unknown;
  timestamp: Date;
}

export async function generateSprintRisk(
  orgId: string,
  sprintId: string
): Promise<SprintRiskReport> {
  // 1. Fetch the sprint
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
  });

  if (sprint.orgId !== orgId) {
    throw new Error("Sprint does not belong to the specified organization");
  }

  // 2. Fetch signals for the sprint
  const signals: SignalRecord[] = await prisma.signal.findMany({
    where: {
      orgId,
      sprintId,
      category: "sprint_risk",
    },
    orderBy: { value: "desc" },
  });

  // 3. Compute composite risk score using weighted average
  const riskScore = calculateSprintRisk(
    signals.map((s: SignalRecord) => ({
      name: s.name,
      value: s.value,
      weight: s.weight,
    }))
  );

  // 4. Generate risk breakdown per signal
  const riskSignals: RiskSignal[] = signals.map((s: SignalRecord) => ({
    name: s.name,
    category: s.category,
    value: s.value,
    weight: s.weight,
    trend: s.trend,
    metadata: s.metadata,
  }));

  // 5. Compute sprint progress
  const now = new Date();
  const startDate = new Date(sprint.startDate);
  const endDate = new Date(sprint.endDate);
  const totalDays = Math.max(
    1,
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const daysElapsed = Math.max(
    0,
    Math.ceil(
      (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const daysRemaining = Math.max(0, totalDays - daysElapsed);
  const percentTimeElapsed = Math.min(
    100,
    Math.round((daysElapsed / totalDays) * 100)
  );

  // Estimate work done based on events during the sprint period
  const sprintEvents: EventRecord[] = await prisma.event.findMany({
    where: {
      orgId,
      timestamp: {
        gte: startDate,
        lte: now > endDate ? endDate : now,
      },
    },
  });

  const ticketsCompleted = sprintEvents.filter(
    (e: EventRecord) => e.type === "ticket_completed"
  ).length;
  const ticketsCreated = sprintEvents.filter(
    (e: EventRecord) => e.type === "ticket_created"
  ).length;
  const totalTickets = Math.max(1, ticketsCreated + ticketsCompleted);
  const percentWorkDone = Math.min(
    100,
    Math.round((ticketsCompleted / totalTickets) * 100)
  );

  const progress: SprintProgress = {
    percentTimeElapsed,
    percentWorkDone,
    daysElapsed,
    daysRemaining,
    totalDays,
  };

  // 6. Generate recommendations based on signals
  const recommendations: string[] = [];

  const highRiskSignals = riskSignals.filter(
    (s: RiskSignal) => s.value >= 60
  );
  const mediumRiskSignals = riskSignals.filter(
    (s: RiskSignal) => s.value >= 40 && s.value < 60
  );

  for (const signal of highRiskSignals) {
    switch (signal.name) {
      case "Scope Creep Index":
        recommendations.push(
          "Remove lower-priority tickets from sprint scope to reduce scope creep"
        );
        break;
      case "PR Review Bottleneck":
        recommendations.push(
          "Implement round-robin review assignments to reduce PR review wait times"
        );
        break;
      case "Blocker Density":
        recommendations.push(
          "Address blocked tickets in daily standup — escalate if blockers persist beyond 24h"
        );
        break;
      case "Velocity Deviation":
        recommendations.push(
          "Adjust sprint commitments to align with rolling average velocity"
        );
        break;
      case "CI Failure Rate":
        recommendations.push(
          "Investigate and fix recurring CI failures to unblock the deployment pipeline"
        );
        break;
      case "Meeting Load":
        recommendations.push(
          "Audit recurring meetings and cancel or shorten those with low value"
        );
        break;
      case "Context Switching":
        recommendations.push(
          "Limit work-in-progress to reduce context switching overhead"
        );
        break;
      case "Late Start Rate":
        recommendations.push(
          "Break down large tickets into smaller tasks to encourage earlier starts"
        );
        break;
    }
  }

  // Add general recommendations based on progress
  if (percentTimeElapsed > 50 && percentWorkDone < 30) {
    recommendations.push(
      "Sprint is past midpoint with less than 30% work done — schedule a mid-sprint review with the team"
    );
  }

  if (mediumRiskSignals.length > 3) {
    recommendations.push(
      "Multiple signals in the amber zone — schedule a focused risk mitigation session"
    );
  }

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      riskScore: sprint.riskScore,
      metadata: sprint.metadata,
    },
    riskScore,
    signals: riskSignals,
    progress,
    recommendations,
  };
}
