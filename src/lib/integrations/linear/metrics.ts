import { fetchIssues, fetchCycles, fetchTeamMembers } from "./client";
import type { LinearIssue, LinearCycle } from "./client";

export interface LinearMetrics {
  issues: {
    total: number;
    created: number;
    completed: number;
    inProgress: number;
    canceled: number;
    byAssignee: Record<string, { total: number; completed: number; inProgress: number }>;
    byPriority: Record<string, number>;
    byLabel: Record<string, number>;
  };
  cycles: {
    active: LinearCycleMetric | null;
    recent: LinearCycleMetric[];
  };
  team: {
    totalMembers: number;
    activeMembers: number;
  };
  period: { since: string; until: string };
}

export interface LinearCycleMetric {
  id: string;
  name: string | null;
  number: number;
  progress: number;
  scope: number;
  startsAt: string;
  endsAt: string;
  issueBreakdown: { total: number; completed: number; inProgress: number; backlog: number };
}

function buildCycleMetric(cycle: LinearCycle): LinearCycleMetric {
  const issues = cycle.issues.nodes;
  const completed = issues.filter((i) => i.state.type === "completed").length;
  const inProgress = issues.filter((i) => i.state.type === "started").length;
  const backlog = issues.filter((i) => i.state.type === "backlog" || i.state.type === "unstarted").length;

  return {
    id: cycle.id,
    name: cycle.name,
    number: cycle.number,
    progress: cycle.progress,
    scope: cycle.scope,
    startsAt: cycle.startsAt,
    endsAt: cycle.endsAt,
    issueBreakdown: {
      total: issues.length,
      completed,
      inProgress,
      backlog,
    },
  };
}

export async function collectLinearMetrics(
  accessToken: string,
  since: string
): Promise<LinearMetrics> {
  const now = new Date().toISOString();

  const [issues, cycles, members] = await Promise.all([
    fetchIssues(accessToken, since),
    fetchCycles(accessToken),
    fetchTeamMembers(accessToken),
  ]);

  const sinceDate = new Date(since);

  // Issue counts
  const created = issues.filter((i) => new Date(i.createdAt) >= sinceDate).length;
  const completed = issues.filter((i) => i.completedAt && new Date(i.completedAt) >= sinceDate).length;
  const inProgress = issues.filter((i) => i.state.type === "started").length;
  const canceled = issues.filter((i) => i.canceledAt && new Date(i.canceledAt) >= sinceDate).length;

  // By assignee
  const byAssignee: Record<string, { total: number; completed: number; inProgress: number }> = {};
  for (const issue of issues) {
    const name = issue.assignee?.name || "Unassigned";
    if (!byAssignee[name]) byAssignee[name] = { total: 0, completed: 0, inProgress: 0 };
    byAssignee[name].total++;
    if (issue.completedAt) byAssignee[name].completed++;
    if (issue.state.type === "started") byAssignee[name].inProgress++;
  }

  // By priority
  const priorityLabels: Record<number, string> = {
    0: "No priority",
    1: "Urgent",
    2: "High",
    3: "Medium",
    4: "Low",
  };
  const byPriority: Record<string, number> = {};
  for (const issue of issues) {
    const label = priorityLabels[issue.priority] || `Priority ${issue.priority}`;
    byPriority[label] = (byPriority[label] || 0) + 1;
  }

  // By label
  const byLabel: Record<string, number> = {};
  for (const issue of issues) {
    for (const label of issue.labels.nodes) {
      byLabel[label.name] = (byLabel[label.name] || 0) + 1;
    }
  }

  // Cycles
  const now_ts = Date.now();
  const activeCycle = cycles.find(
    (c) => new Date(c.startsAt).getTime() <= now_ts && new Date(c.endsAt).getTime() >= now_ts
  );

  return {
    issues: {
      total: issues.length,
      created,
      completed,
      inProgress,
      canceled,
      byAssignee,
      byPriority,
      byLabel,
    },
    cycles: {
      active: activeCycle ? buildCycleMetric(activeCycle) : null,
      recent: cycles.slice(0, 5).map(buildCycleMetric),
    },
    team: {
      totalMembers: members.length,
      activeMembers: members.filter((m) => m.active).length,
    },
    period: { since, until: now },
  };
}
