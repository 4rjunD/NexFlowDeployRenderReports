// ─────────────────────────────────────────────────────────────
// Jira metrics collector — enhanced for deliverable tracking
// ─────────────────────────────────────────────────────────────

import {
  getAccessibleSites,
  fetchProjects,
  fetchBoards,
  fetchSprintsForBoard,
  fetchSprintIssues,
  searchIssues,
  fetchEpics,
  fetchEpicChildren,
  type JiraIssue,
} from "./client";

export interface DeliverableStatus {
  key: string;
  summary: string;
  status: string;
  statusCategory: string; // "done" | "indeterminate" | "new"
  assignee: string;
  priority: string;
  childIssues: {
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
  };
  completionPct: number;
  dueDate: string | null;
  labels: string[];
  components: string[];
}

export interface JiraMetrics {
  issues: {
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
    byAssignee: Record<string, { total: number; completed: number; inProgress: number }>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    byComponent: Record<string, { total: number; completed: number }>;
    byLabel: Record<string, { total: number; completed: number }>;
    avgResolutionTimeHours: number;
    overdue: { key: string; summary: string; assignee: string; dueDate: string; daysOverdue: number }[];
    recentlyCompleted: { key: string; summary: string; assignee: string; completedDate: string }[];
  };
  deliverables: DeliverableStatus[];
  sprints: {
    active: { name: string; goal?: string; startDate?: string; endDate?: string; totalIssues: number; completedIssues: number; issueBreakdown: { key: string; summary: string; status: string; assignee: string; type: string }[] } | null;
    recentClosed: { name: string; totalIssues: number; completedIssues: number; completionRate: number }[];
  };
  projects: string[];
  site: string;
  period: { since: string; until: string };
}

function extractTextFromDescription(desc: unknown): string {
  if (!desc) return "";
  if (typeof desc === "string") return desc.slice(0, 500);
  // Atlassian Document Format — extract text nodes
  try {
    const extract = (node: Record<string, unknown>): string => {
      if (node.type === "text" && typeof node.text === "string") return node.text;
      if (Array.isArray(node.content)) return node.content.map((c: Record<string, unknown>) => extract(c)).join(" ");
      return "";
    };
    return extract(desc as Record<string, unknown>).slice(0, 500);
  } catch {
    return "";
  }
}

export async function collectJiraMetrics(
  accessToken: string,
  since: string
): Promise<JiraMetrics> {
  const now = new Date().toISOString();
  const nowDate = new Date();

  // Get the first accessible Jira cloud site
  const sites = await getAccessibleSites(accessToken);
  if (sites.length === 0) {
    throw new Error("No accessible Jira sites found");
  }
  const cloudId = sites[0].id;
  const siteName = sites[0].name;

  // Fetch projects
  const projects = await fetchProjects(accessToken, cloudId);
  const projectNames = projects.map((p) => p.name);

  // Fetch all issues updated since the period
  const sinceDate = since.split("T")[0];
  const allIssues = await searchIssues(
    accessToken,
    cloudId,
    `updated >= "${sinceDate}" ORDER BY updated DESC`,
    200
  );

  // Fetch epics for deliverable tracking
  const epics = await fetchEpics(accessToken, cloudId, since);
  const deliverables: DeliverableStatus[] = [];

  // For each epic, get child issues to calculate completion
  for (const epic of epics.slice(0, 20)) {
    let children: JiraIssue[] = [];
    try {
      children = await fetchEpicChildren(accessToken, cloudId, epic.key);
    } catch {
      // Epic may have no children or API may fail
    }

    const childCompleted = children.filter(i => i.fields.status.statusCategory.key === "done").length;
    const childInProgress = children.filter(i => i.fields.status.statusCategory.key === "indeterminate").length;
    const childTodo = children.filter(i => i.fields.status.statusCategory.key === "new").length;
    const totalChildren = children.length;
    const completionPct = totalChildren > 0 ? Math.round((childCompleted / totalChildren) * 100) : (epic.fields.status.statusCategory.key === "done" ? 100 : 0);

    deliverables.push({
      key: epic.key,
      summary: epic.fields.summary,
      status: epic.fields.status.name,
      statusCategory: epic.fields.status.statusCategory.key,
      assignee: epic.fields.assignee?.displayName || "Unassigned",
      priority: epic.fields.priority?.name || "None",
      childIssues: {
        total: totalChildren,
        completed: childCompleted,
        inProgress: childInProgress,
        todo: childTodo,
      },
      completionPct,
      dueDate: epic.fields.duedate || null,
      labels: epic.fields.labels || [],
      components: (epic.fields.components || []).map(c => c.name),
    });
  }

  // Fetch boards and sprints
  const boards = await fetchBoards(accessToken, cloudId);
  let activeSprint: JiraMetrics["sprints"]["active"] = null;
  const recentClosed: JiraMetrics["sprints"]["recentClosed"] = [];

  for (const board of boards.slice(0, 5)) {
    const sprints = await fetchSprintsForBoard(accessToken, cloudId, board.id);

    for (const sprint of sprints) {
      const sprintIssues = await fetchSprintIssues(accessToken, cloudId, sprint.id);
      const completed = sprintIssues.filter(
        (i) => i.fields.status.statusCategory.key === "done"
      ).length;

      if (sprint.state === "active" && !activeSprint) {
        activeSprint = {
          name: sprint.name,
          goal: sprint.goal,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          totalIssues: sprintIssues.length,
          completedIssues: completed,
          issueBreakdown: sprintIssues.map(i => ({
            key: i.key,
            summary: i.fields.summary,
            status: i.fields.status.name,
            assignee: i.fields.assignee?.displayName || "Unassigned",
            type: i.fields.issuetype.name,
          })),
        };
      } else if (sprint.state === "closed" && recentClosed.length < 3) {
        recentClosed.push({
          name: sprint.name,
          totalIssues: sprintIssues.length,
          completedIssues: completed,
          completionRate:
            sprintIssues.length > 0
              ? Math.round((completed / sprintIssues.length) * 100)
              : 0,
        });
      }
    }
  }

  // Compute issue metrics
  const completed = allIssues.filter((i) => i.fields.status.statusCategory.key === "done").length;
  const inProgress = allIssues.filter((i) => i.fields.status.statusCategory.key === "indeterminate").length;
  const todo = allIssues.filter((i) => i.fields.status.statusCategory.key === "new").length;

  const byAssignee: Record<string, { total: number; completed: number; inProgress: number }> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byComponent: Record<string, { total: number; completed: number }> = {};
  const byLabel: Record<string, { total: number; completed: number }> = {};
  const resolutionTimes: number[] = [];
  const overdue: JiraMetrics["issues"]["overdue"] = [];
  const recentlyCompleted: JiraMetrics["issues"]["recentlyCompleted"] = [];

  for (const issue of allIssues) {
    const assignee = issue.fields.assignee?.displayName || "Unassigned";
    const isDone = issue.fields.status.statusCategory.key === "done";
    const isInProg = issue.fields.status.statusCategory.key === "indeterminate";

    if (!byAssignee[assignee]) byAssignee[assignee] = { total: 0, completed: 0, inProgress: 0 };
    byAssignee[assignee].total++;
    if (isDone) byAssignee[assignee].completed++;
    if (isInProg) byAssignee[assignee].inProgress++;

    const priority = issue.fields.priority?.name || "None";
    byPriority[priority] = (byPriority[priority] || 0) + 1;

    const issueType = issue.fields.issuetype.name;
    byType[issueType] = (byType[issueType] || 0) + 1;

    // Components
    for (const comp of issue.fields.components || []) {
      if (!byComponent[comp.name]) byComponent[comp.name] = { total: 0, completed: 0 };
      byComponent[comp.name].total++;
      if (isDone) byComponent[comp.name].completed++;
    }

    // Labels
    for (const label of issue.fields.labels || []) {
      if (!byLabel[label]) byLabel[label] = { total: 0, completed: 0 };
      byLabel[label].total++;
      if (isDone) byLabel[label].completed++;
    }

    // Resolution time
    if (issue.fields.resolutiondate && issue.fields.created) {
      const created = new Date(issue.fields.created).getTime();
      const resolved = new Date(issue.fields.resolutiondate).getTime();
      resolutionTimes.push((resolved - created) / (1000 * 60 * 60));
    }

    // Overdue check
    if (issue.fields.duedate && !isDone) {
      const due = new Date(issue.fields.duedate);
      if (due < nowDate) {
        const daysOverdue = Math.round((nowDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        overdue.push({
          key: issue.key,
          summary: issue.fields.summary,
          assignee,
          dueDate: issue.fields.duedate,
          daysOverdue,
        });
      }
    }

    // Recently completed (last 14 days)
    if (isDone && issue.fields.resolutiondate) {
      const resolved = new Date(issue.fields.resolutiondate);
      const fourteenDaysAgo = new Date(nowDate.getTime() - 14 * 24 * 60 * 60 * 1000);
      if (resolved >= fourteenDaysAgo) {
        recentlyCompleted.push({
          key: issue.key,
          summary: issue.fields.summary,
          assignee,
          completedDate: issue.fields.resolutiondate,
        });
      }
    }
  }

  // Sort overdue by most overdue first
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const avgResolutionTimeHours =
    resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : 0;

  return {
    issues: {
      total: allIssues.length,
      completed,
      inProgress,
      todo,
      byAssignee,
      byPriority,
      byType,
      byComponent,
      byLabel,
      avgResolutionTimeHours,
      overdue: overdue.slice(0, 15),
      recentlyCompleted: recentlyCompleted.slice(0, 20),
    },
    deliverables,
    sprints: {
      active: activeSprint,
      recentClosed,
    },
    projects: projectNames,
    site: siteName,
    period: { since, until: now },
  };
}
