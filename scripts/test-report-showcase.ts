/**
 * Deep test — generates a showcase HTML report with rich mock data
 * covering ALL discovery card types, then opens in browser.
 *
 * Usage: npx tsx scripts/test-report-showcase.ts
 */

import { buildReportHtml } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";

// ── Rich mock data covering ALL integrations ──

const now = new Date();
const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

const githubData = {
  commits: {
    total: 347,
    byAuthor: {
      "Alex Chen": 98,
      "Sarah Kim": 74,
      "David Park": 63,
      "Maria Lopez": 55,
      "James Wu": 34,
      "Emily Turner": 23,
    },
  },
  pullRequests: {
    opened: 89,
    merged: 72,
    closed: 14,
    avgMergeTimeHours: 18.3,
    openedByAuthor: {
      "Alex Chen": 24, "Sarah Kim": 19, "David Park": 16,
      "Maria Lopez": 14, "James Wu": 10, "Emily Turner": 6,
    },
    mergedByAuthor: {
      "Alex Chen": 20, "Sarah Kim": 16, "David Park": 13,
      "Maria Lopez": 11, "James Wu": 8, "Emily Turner": 4,
    },
    stalePrs: [
      { number: 412, title: "Refactor authentication middleware to support OAuth2.1", author: "David Park", daysOpen: 18, additions: 1420, deletions: 890, url: "" },
      { number: 398, title: "Add batch processing for webhook events", author: "James Wu", daysOpen: 14, additions: 670, deletions: 120, url: "" },
      { number: 405, title: "Migrate legacy API endpoints to v2 schema", author: "Maria Lopez", daysOpen: 11, additions: 340, deletions: 510, url: "" },
      { number: 410, title: "Performance improvements for dashboard queries", author: "Alex Chen", daysOpen: 8, additions: 230, deletions: 80, url: "" },
    ],
    avgPrSizeLines: 285,
  },
  reviews: {
    total: 156,
    avgTurnaroundTimeHours: 8.7,
    byReviewer: {
      "Alex Chen": 42, "Sarah Kim": 38, "David Park": 31,
      "Maria Lopez": 24, "James Wu": 14, "Emily Turner": 7,
    },
  },
  issues: {
    total: 45, open: 18, closed: 27,
    byLabel: {
      "bug": { total: 12, open: 4, closed: 8 },
      "feature": { total: 15, open: 6, closed: 9 },
      "enhancement": { total: 8, open: 3, closed: 5 },
    },
  },
  milestones: [
    { title: "v2.0 Launch", repo: "nexflow-platform", state: "open", openIssues: 8, closedIssues: 22, completionPct: 73, dueOn: "2026-04-01T00:00:00Z" },
    { title: "API v2 Migration", repo: "nexflow-api", state: "open", openIssues: 3, closedIssues: 12, completionPct: 80, dueOn: "2026-03-20T00:00:00Z" },
  ],
};

const slackData = {
  totalMessages: 4892,
  activeChannels: 14,
  topContributors: [
    { displayName: "Sarah Kim", messageCount: 823, userId: "U1" },
    { displayName: "Alex Chen", messageCount: 691, userId: "U2" },
    { displayName: "David Park", messageCount: 534, userId: "U3" },
    { displayName: "Maria Lopez", messageCount: 412, userId: "U4" },
    { displayName: "Tom Wilson", messageCount: 947, userId: "U7" },
  ],
  channelBreakdown: {
    "engineering": 1240, "frontend": 890, "backend": 780,
    "deployments": 520, "incidents": 310,
  },
  messagesByDayOfWeek: { Mon: 920, Tue: 1050, Wed: 880, Thu: 790, Fri: 650, Sat: 102, Sun: 500 },
  afterHoursMessagePct: 22,
  peakDay: "Tue",
  quietestDay: "Fri",
  silentChannels: ["legacy-api", "old-design", "archive-q3"],
  avgThreadResponseMinutes: 14,
};

const jiraData = {
  issues: {
    total: 134, completed: 89, inProgress: 28,
    overdue: [
      { key: "PROJ-142", summary: "API v2 endpoint migration", assignee: "David Park", dueDate: "2026-03-01", daysOverdue: 12 },
      { key: "PROJ-198", summary: "Fix OAuth token refresh flow", assignee: "Alex Chen", dueDate: "2026-03-05", daysOverdue: 8 },
      { key: "PROJ-201", summary: "Production deploy pipeline fix", assignee: "James Wu", dueDate: "2026-03-08", daysOverdue: 5 },
    ],
    avgResolutionTimeHours: 36.4,
    byAssignee: {
      "Alex Chen": { total: 32, completed: 24, inProgress: 5 },
      "Sarah Kim": { total: 28, completed: 20, inProgress: 6 },
      "David Park": { total: 26, completed: 16, inProgress: 7 },
      "Maria Lopez": { total: 22, completed: 15, inProgress: 5 },
    },
    byPriority: { Urgent: 8, High: 34, Medium: 52, Low: 28 },
    byType: { Story: 48, Bug: 32, Task: 28, Epic: 12 },
  },
  deliverables: [
    { key: "PROJ-100", summary: "v2 API Migration", status: "In Progress", statusCategory: "indeterminate", assignee: "David Park", completionPct: 68, dueDate: "2026-03-20", childIssues: { total: 15, completed: 10 } },
    { key: "PROJ-101", summary: "Authentication Overhaul", status: "In Progress", statusCategory: "indeterminate", assignee: "Alex Chen", completionPct: 45, dueDate: "2026-03-25", childIssues: { total: 12, completed: 5 } },
    { key: "PROJ-102", summary: "Performance Optimization Sprint", status: "In Progress", statusCategory: "indeterminate", assignee: "Sarah Kim", completionPct: 82, dueDate: "2026-03-15", childIssues: { total: 8, completed: 7 } },
    { key: "PROJ-103", summary: "Security Audit Remediation", status: "To Do", statusCategory: "new", assignee: "Maria Lopez", completionPct: 10, dueDate: "2026-04-01", childIssues: { total: 20, completed: 2 } },
    { key: "PROJ-105", summary: "CI/CD Pipeline Improvements", status: "In Progress", statusCategory: "indeterminate", assignee: "James Wu", completionPct: 55, dueDate: "2026-02-28", childIssues: { total: 10, completed: 6 } },
  ],
  sprints: {
    active: {
      name: "Sprint 14",
      goal: "Complete API v2 migration and auth overhaul",
      totalIssues: 24,
      completedIssues: 14,
      inProgressIssues: 7,
      todoIssues: 3,
      daysRemaining: 4,
      daysElapsed: 10,
    },
    recentClosed: [
      { name: "Sprint 13", totalIssues: 22, completedIssues: 18, completionRate: 82 },
      { name: "Sprint 12", totalIssues: 20, completedIssues: 17, completionRate: 85 },
      { name: "Sprint 11", totalIssues: 25, completedIssues: 19, completionRate: 76 },
      { name: "Sprint 10", totalIssues: 18, completedIssues: 16, completionRate: 89 },
      { name: "Sprint 9", totalIssues: 21, completedIssues: 15, completionRate: 71 },
    ],
  },
};

const googleCalendarData = {
  meetings: {
    total: 187, totalHours: 142.5,
    byDay: { Mon: 38, Tue: 42, Wed: 35, Thu: 40, Fri: 22, Sat: 5, Sun: 5 },
  },
  focusTime: { avgFocusHoursPerDay: 3.2, totalFocusHours: 288 },
  period: { since: periodStart.toISOString(), until: now.toISOString() },
  meetingCostEstimate: 21375,
  recurringMeetingPct: 62,
  peakMeetingDay: "Tue",
  externalMeetingPct: 18,
};

const integrationData: Record<string, unknown> = {
  github: githubData,
  slack: slackData,
  jira: jiraData,
  googleCalendar: googleCalendarData,
};

const connectedSources = ["GITHUB", "SLACK", "JIRA", "GOOGLE_CALENDAR"];

// ── Compute health score ──
const healthScore = computeHealthScore(integrationData, false);

// ── Build report content (pre-computed signals as mock) ──
const reportContent = {
  integrationData,
  connectedSources,
  periodStart: periodStart.toISOString(),
  periodEnd: now.toISOString(),
  // Blockers mock (A1)
  blockers: {
    blockers: [
      { channelName: "engineering", userId: "U1", messageSnippet: "We're blocked by PROJ-142 — can't proceed with the v2 API migration until the auth middleware is refactored", timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), matchedKeyword: "blocked by", referencedTickets: ["PROJ-142"], confidence: "high" },
      { channelName: "backend", userId: "U3", messageSnippet: "Stuck on the OAuth token refresh flow — waiting on Alex to review PROJ-198", timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), matchedKeyword: "stuck on", referencedTickets: ["PROJ-198"], confidence: "high" },
      { channelName: "deployments", userId: "U4", messageSnippet: "Waiting for the CI/CD pipeline fix before we can deploy. Any update on this?", timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), matchedKeyword: "waiting for", referencedTickets: [], confidence: "medium" },
      { channelName: "frontend", userId: "U2", messageSnippet: "This depends on PROJ-142 being done first — can't start the frontend integration", timestamp: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), matchedKeyword: "depends on", referencedTickets: ["PROJ-142"], confidence: "high" },
      { channelName: "engineering", userId: "U5", messageSnippet: "Blocker: the staging environment is down, can't test the new endpoints", timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), matchedKeyword: "blocker", referencedTickets: [], confidence: "medium" },
    ],
    totalMessagesScanned: 4892,
    channelsScanned: 14,
  },
  // Trends mock
  trends: {
    trends: [
      { label: "PRs Merged", currentValue: 72, priorValue: 58, pctChange: 24, direction: "up", isPositive: true },
      { label: "Merge Time", currentValue: 18.3, priorValue: 24.1, pctChange: -24, direction: "down", isPositive: true },
      { label: "Review Turnaround", currentValue: 8.7, priorValue: 12.3, pctChange: -29, direction: "down", isPositive: true },
      { label: "Total Commits", currentValue: 347, priorValue: 280, pctChange: 24, direction: "up", isPositive: true },
      { label: "Issue Completion", currentValue: 66, priorValue: 72, pctChange: -8, direction: "down", isPositive: false },
      { label: "Overdue Issues", currentValue: 3, priorValue: 7, pctChange: -57, direction: "down", isPositive: true },
      { label: "Focus Time", currentValue: 3.2, priorValue: 2.8, pctChange: 14, direction: "up", isPositive: true },
      { label: "Meeting Hours", currentValue: 142.5, priorValue: 165, pctChange: -14, direction: "down", isPositive: true },
      { label: "Slack Messages", currentValue: 4892, priorValue: 3800, pctChange: 29, direction: "up", isPositive: false },
    ],
  },
  anomalies: { contributorAnomalies: [], teamTrends: [] },
  // Code churn mock
  codeChurn: {
    netLinesAdded: 2693,
    totalAdditions: 5065,
    totalDeletions: 2372,
    churnRatio: 0.47,
    avgPrSize: 285,
    largePrCount: 2,
    largePrs: [
      { title: "Refactor auth middleware", author: "David Park", additions: 1420, deletions: 890 },
      { title: "Implement rate limiting", author: "Sarah Kim", additions: 560, deletions: 20 },
    ],
  },
  // Sprint forecast mock
  sprintForecast: {
    avgIssuesPerSprint: 17,
    avgCompletionRate: 81,
    predictedCompletion: 18,
    currentSprintPlanned: 24,
    predictedCompletionRate: 75,
    confidence: "medium",
    recommendation: "Consider descoping 2-3 lower-priority tickets to hit 90%+ completion.",
    sprintHistory: [
      { name: "Sprint 13", planned: 22, completed: 18, rate: 82 },
      { name: "Sprint 12", planned: 20, completed: 17, rate: 85 },
      { name: "Sprint 11", planned: 25, completed: 19, rate: 76 },
      { name: "Sprint 10", planned: 18, completed: 16, rate: 89 },
    ],
  },
  sprintCarryOver: {
    carryOverCount: 2,
    carryOverIssues: [
      { key: "PROJ-223", summary: "Add pagination to /reports API", assignee: "Maria Lopez" },
      { key: "PROJ-225", summary: "Update error handling for auth flow", assignee: "James Wu" },
    ],
  },
  // Cross-source mock
  crossSource: {
    insights: [
      {
        id: "review-bottleneck-communication",
        title: "Top reviewers are also the most active communicators — context switching may be impacting review quality",
        description: "Alex Chen and Sarah Kim handle 51% of all reviews while also being the top 2 Slack communicators. This dual load creates context-switching overhead and makes them single points of failure for both code quality and team communication.",
        sources: ["github", "slack"],
        severity: "warning",
        metrics: { top2ReviewPct: 51, totalReviews: 156, highSlackReviewerCount: 2 },
      },
      {
        id: "focus-time-healthy-velocity",
        title: "Meeting load reduction is correlating with improved shipping velocity",
        description: "Meeting hours dropped 14% (165h → 142.5h) while PRs merged increased 24% (58 → 72). This suggests the team is converting reclaimed meeting time into productive shipping capacity.",
        sources: ["googleCalendar", "github"],
        severity: "positive",
        metrics: { meetingHoursDelta: -14, prsMergedDelta: 24, focusHoursPerDay: 3.2 },
      },
    ],
    sourcesAnalyzed: ["github", "slack", "jira", "googleCalendar"],
  },
  // Benchmarks mock
  benchmarks: {
    overallPerformance: "above_average",
    comparisons: [
      { label: "PR Merge Time", currentValue: 18.3, benchmarkValue: 24, performance: "above", gap: -24, benchmarkLabel: "Industry median" },
      { label: "Review Turnaround", currentValue: 8.7, benchmarkValue: 12, performance: "above", gap: -28, benchmarkLabel: "Industry median" },
      { label: "Sprint Completion", currentValue: 81, benchmarkValue: 85, performance: "below", gap: -5, benchmarkLabel: "Industry median" },
      { label: "PR Merge Rate", currentValue: 81, benchmarkValue: 85, performance: "below", gap: -5, benchmarkLabel: "Industry median" },
      { label: "Focus Time", currentValue: 3.2, benchmarkValue: 4, performance: "below", gap: -20, benchmarkLabel: "Industry median" },
      { label: "Commit Frequency", currentValue: 3.9, benchmarkValue: 3, performance: "above", gap: 30, benchmarkLabel: "Industry median" },
    ],
  },
  // Progression mock (7 reports)
  progression: {
    reportCount: 7,
    weeksTracked: 42,
    estimatedTimeSavedHours: 84,
    estimatedCostSavings: 12600,
    healthScoreJourney: [52, 55, 59, 62, 68, 74, 83],
    metrics: [
      { label: "PR Merge Time", firstValue: 38, currentValue: 18.3, direction: "improved", totalPctChange: -52 },
      { label: "Review Turnaround", firstValue: 22, currentValue: 8.7, direction: "improved", totalPctChange: -60 },
      { label: "Sprint Completion", firstValue: 65, currentValue: 81, direction: "improved", totalPctChange: 25 },
      { label: "Focus Time", firstValue: 2.1, currentValue: 3.2, direction: "improved", totalPctChange: 52 },
      { label: "Overdue Issues", firstValue: 11, currentValue: 3, direction: "improved", totalPctChange: -73 },
    ],
  },
  // Action items
  actionItems: [
    {
      priority: "P1",
      title: "Escalate PROJ-142 API migration",
      description: "12 days overdue, referenced as blocker 3x in Slack. Assign second engineer or reduce scope.",
      relatedMetrics: ["overdueIssues"],
      suggestedOwner: "Engineering Lead",
    },
    {
      priority: "P1",
      title: "Audit recurring meetings",
      description: "62% of meetings are recurring. Focus time is below 4h/day target. Each reclaimed hour adds ~90 eng hours/quarter.",
      relatedMetrics: ["avgFocusHoursPerDay", "totalMeetingHours"],
      suggestedOwner: "Team Lead",
    },
    {
      priority: "P2",
      title: "Distribute code review load",
      description: "Alex and Sarah handle 51% of reviews. Rotate assignments to reduce bus-factor risk.",
      relatedMetrics: ["totalReviews"],
      suggestedOwner: "Alex Chen / Sarah Kim",
    },
    {
      priority: "P2",
      title: "Establish PR size guidelines",
      description: "2 PRs exceeded 500 LOC. Set soft limit of 400 LOC for faster reviews.",
      relatedMetrics: ["avgPrMergeTimeHours"],
    },
    {
      priority: "P3",
      title: "Monitor after-hours messaging",
      description: "At 22% — if it rises above 25%, discuss async communication boundaries.",
      relatedMetrics: ["slackMessages"],
    },
  ],
  // Prior report for comparison
  priorReport: {
    periodEnd: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    keyMetrics: {
      totalCommits: 280, prsMerged: 58, avgPrMergeTimeHours: 24.1,
      totalReviews: 120, avgReviewTurnaroundHours: 12.3,
      jiraCompletionRate: 72, overdueIssues: 7,
      slackMessages: 3800, totalMeetingHours: 165,
      avgFocusHoursPerDay: 2.8, healthScore: 62, healthGrade: "B-",
    },
    actionItems: [
      { priority: "P1", title: "Reduce PR merge time below 24h", description: "Merge time too high", relatedMetrics: ["avgPrMergeTimeHours"] },
      { priority: "P2", title: "Address overdue Jira tickets", description: "7 overdue tickets", relatedMetrics: ["overdueIssues"] },
      { priority: "P3", title: "Increase focus time to 4h/day", description: "Need more deep work time", relatedMetrics: ["avgFocusHoursPerDay"] },
    ],
  },
  reportNumber: 8,
};

// ── AI Narrative ──
const aiNarrative = `## Executive Summary

This period marks a notable acceleration in engineering output. The team shipped **72 PRs** with an average merge time of **18.3 hours** — a 24% improvement over last period's 24.1h. Commit volume rose to 347, up from 280.

:::callout-positive
PR merge time dropped from 24.1h to 18.3h — the team has addressed last period's P1 recommendation to reduce cycle time. This correlates with improved review turnaround (8.7h, down from 12.3h).
:::

However, three overdue Jira tickets remain bottlenecks. PROJ-142 (API v2 migration) has been open 12 days past its due date and is referenced multiple times in Slack as a blocker.

:::callout-risk
**PROJ-142** and **PROJ-198** are blocking the v2 release. Both are referenced in Slack as blockers by multiple team members. Escalation is recommended.
:::

## Delivery & Velocity

The team completed 89 of 134 Jira issues (66% completion rate), with 28 currently in progress. Sprint 14 is tracking at 58% completion with 4 days remaining.

Alex Chen continues to be the highest-output contributor with 98 commits and 24 PRs. Review load is concentrated: Alex and Sarah handle **51% of all reviews**, which presents a bus-factor risk.

### Code Quality

Review turnaround improved significantly to 8.7h (from 12.3h). The team maintains strong review coverage with 156 reviews across 89 PRs. However, 4 PRs have been open for more than 7 days.

:::callout-info
The churn ratio of 0.47 is healthy, indicating net-positive code growth. Two PRs exceed 500 LOC — consider breaking these into smaller increments.
:::

## Team Collaboration

Slack activity shows healthy engagement at 4,892 messages across 14 channels. Tuesday is peak day. After-hours messaging is at 22% — worth monitoring.

### Meeting & Focus Time

The team spent 142.5 hours in meetings, with 62% recurring. Focus time is 3.2h/day — below the 4h target. Meeting cost is estimated at $21,375.

:::callout-risk
Focus time at 3.2h/day is below the 4h/day target. With 62% recurring meetings, consider auditing for necessity. Each hour reclaimed adds ~90 engineering hours per quarter.
:::`;

// ── Generate HTML ──
const html = buildReportHtml({
  title: "Weekly Engineering Digest — Dec 13 to Mar 13, 2026",
  orgName: "Acme Corp Engineering",
  periodStart,
  periodEnd: now,
  generatedAt: now,
  aiNarrative,
  content: reportContent,
  showDownloadBar: true,
  healthScore,
});

const outPath = path.join("/tmp", "nexflow-report-showcase.html");
fs.writeFileSync(outPath, html, "utf-8");
console.log(`\n✅ Report written to: ${outPath}`);
console.log(`📄 Opening in browser...`);
execSync(`open "${outPath}"`);
