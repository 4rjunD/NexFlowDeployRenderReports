// ─────────────────────────────────────────────────────────────
// Jira metrics collector
// ─────────────────────────────────────────────────────────────

import {
  getAccessibleSites,
  fetchProjects,
  fetchBoards,
  fetchSprintsForBoard,
  fetchSprintIssues,
  searchIssues,
  type JiraIssue,
  type JiraSprint,
} from "./client";

export interface JiraMetrics {
  issues: {
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
    byAssignee: Record<string, { total: number; completed: number; inProgress: number }>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
    avgResolutionTimeHours: number;
  };
  sprints: {
    active: { name: string; goal?: string; startDate?: string; endDate?: string; totalIssues: number; completedIssues: number } | null;
    recentClosed: { name: string; totalIssues: number; completedIssues: number; completionRate: number }[];
  };
  projects: string[];
  site: string;
  period: { since: string; until: string };
}

export async function collectJiraMetrics(
  accessToken: string,
  since: string
): Promise<JiraMetrics> {
  const now = new Date().toISOString();

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
  const resolutionTimes: number[] = [];

  for (const issue of allIssues) {
    const assignee = issue.fields.assignee?.displayName || "Unassigned";
    if (!byAssignee[assignee]) byAssignee[assignee] = { total: 0, completed: 0, inProgress: 0 };
    byAssignee[assignee].total++;
    if (issue.fields.status.statusCategory.key === "done") byAssignee[assignee].completed++;
    if (issue.fields.status.statusCategory.key === "indeterminate") byAssignee[assignee].inProgress++;

    const priority = issue.fields.priority?.name || "None";
    byPriority[priority] = (byPriority[priority] || 0) + 1;

    const issueType = issue.fields.issuetype.name;
    byType[issueType] = (byType[issueType] || 0) + 1;

    if (issue.fields.resolutiondate && issue.fields.created) {
      const created = new Date(issue.fields.created).getTime();
      const resolved = new Date(issue.fields.resolutiondate).getTime();
      resolutionTimes.push((resolved - created) / (1000 * 60 * 60));
    }
  }

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
      avgResolutionTimeHours,
    },
    sprints: {
      active: activeSprint,
      recentClosed,
    },
    projects: projectNames,
    site: siteName,
    period: { since, until: now },
  };
}
