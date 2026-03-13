// ─────────────────────────────────────────────────────────────
// Cross-Source Intelligence — Correlate signals across integrations
// to surface insights that no single source can reveal alone.
// ─────────────────────────────────────────────────────────────

import type { GitHubMetrics } from "@/lib/integrations/github/metrics";
import type { SlackMetrics } from "@/lib/integrations/slack/metrics";
import type { GoogleCalendarMetrics } from "@/lib/integrations/google/metrics";
import type { JiraMetrics } from "@/lib/integrations/jira/metrics";

// ── Types ──

export interface CrossSourceInsight {
  id: string;
  title: string;
  description: string;
  sources: string[]; // which integrations contributed to this insight
  severity: "info" | "warning" | "positive";
  metrics: Record<string, number | string>; // supporting data points
}

export interface CrossSourceAnalysis {
  insights: CrossSourceInsight[];
  sourcesAnalyzed: string[];
}

// ── Helpers ──

interface IntegrationData {
  github?: GitHubMetrics;
  slack?: SlackMetrics;
  googleCalendar?: GoogleCalendarMetrics;
  jira?: JiraMetrics;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function has(sources: string[], ...required: string[]): boolean {
  return required.every((s) => sources.includes(s));
}

/** Compute the number of weeks in a period string range. */
function weeksInPeriod(since: string, until: string): number {
  const start = new Date(since).getTime();
  const end = new Date(until).getTime();
  return Math.max(1, (end - start) / (1000 * 60 * 60 * 24 * 7));
}

// Common Jira ticket key pattern: PROJECT-123
const JIRA_KEY_REGEX = /\b[A-Z][A-Z0-9]+-\d+\b/g;

// ── Correlation Checks ──

function checkMeetingLoadVsShipping(
  calendar: GoogleCalendarMetrics,
  github: GitHubMetrics
): CrossSourceInsight[] {
  const insights: CrossSourceInsight[] = [];

  const weeks = weeksInPeriod(calendar.period.since, calendar.period.until);
  const meetingHoursPerWeek = Math.round((calendar.meetings.totalHours / weeks) * 10) / 10;
  const commitsPerWeek = Math.round((github.commits.total / weeks) * 10) / 10;
  const focusHoursPerDay = calendar.focusTime.avgFocusHoursPerDay;

  // Check: high meeting load with low commit velocity
  // We flag if meetings > 25h/week. For "commits trending down" without historical data,
  // we use a heuristic: fewer than 10 commits/week when meetings are high signals compression.
  if (meetingHoursPerWeek > 25 && commitsPerWeek < 10) {
    insights.push({
      id: "meeting-load-vs-shipping",
      title: "High meeting load may be compressing development time",
      description: `Meeting load (${meetingHoursPerWeek}h/week) may be compressing development time. Commit velocity is low at ${commitsPerWeek} commits/week.`,
      sources: ["google", "github"],
      severity: "warning",
      metrics: {
        meetingHoursPerWeek,
        commitsPerWeek,
        focusHoursPerDay,
      },
    });
  }

  // Check: strong focus time correlating with healthy commits
  if (focusHoursPerDay >= 4 && commitsPerWeek >= 15) {
    insights.push({
      id: "focus-time-healthy-velocity",
      title: "Strong focus time correlating with healthy commit velocity",
      description: `Strong focus time (${focusHoursPerDay}h/day) correlating with healthy commit velocity (${commitsPerWeek} commits/week).`,
      sources: ["google", "github"],
      severity: "positive",
      metrics: {
        focusHoursPerDay,
        commitsPerWeek,
        meetingHoursPerWeek,
      },
    });
  }

  return insights;
}

function checkBlockerToTicketCrossRef(
  slack: SlackMetrics,
  jira: JiraMetrics
): CrossSourceInsight[] {
  const insights: CrossSourceInsight[] = [];

  // Extract blocker mentions from raw Slack messages
  const rawMessages = slack._rawMessages;
  if (!rawMessages || rawMessages.length === 0) return insights;

  // Collect all text that mentions "block" variants
  const blockerTexts: string[] = [];
  for (const channel of rawMessages) {
    for (const msg of channel.messages) {
      const text = msg.text.toLowerCase();
      if (
        text.includes("block") ||
        text.includes("stuck") ||
        text.includes("waiting on") ||
        text.includes("depends on") ||
        text.includes("blocker")
      ) {
        blockerTexts.push(msg.text);
      }
    }
  }

  if (blockerTexts.length === 0) return insights;

  // Build set of overdue Jira ticket keys
  const overdueKeys = new Set(jira.issues.overdue.map((i) => i.key));

  // Find Jira keys mentioned in blocker messages
  const referencedKeys = new Set<string>();
  for (const text of blockerTexts) {
    const matches = text.match(JIRA_KEY_REGEX);
    if (matches) {
      for (const key of matches) {
        if (overdueKeys.has(key)) {
          referencedKeys.add(key);
        }
      }
    }
  }

  if (referencedKeys.size > 0) {
    insights.push({
      id: "blocker-ticket-cross-ref",
      title: "Slack blockers reference overdue Jira tickets",
      description: `${blockerTexts.length} blocker mention${blockerTexts.length === 1 ? "" : "s"} in Slack reference ${referencedKeys.size} overdue Jira ticket${referencedKeys.size === 1 ? "" : "s"} — these are confirmed bottlenecks.`,
      sources: ["slack", "jira"],
      severity: "warning",
      metrics: {
        blockerMentions: blockerTexts.length,
        overdueTicketsReferenced: referencedKeys.size,
        totalOverdueTickets: jira.issues.overdue.length,
        confirmedBottleneckKeys: Array.from(referencedKeys).join(", "),
      },
    });
  }

  return insights;
}

function checkContributorActivityBalance(
  github: GitHubMetrics,
  slack: SlackMetrics
): CrossSourceInsight[] {
  const insights: CrossSourceInsight[] = [];

  const commitsByAuthor = github.commits.byAuthor;
  const slackContributors = slack.topContributors;

  // Build lookup of Slack display names to message counts
  const slackCounts = new Map<string, number>();
  for (const c of slackContributors) {
    slackCounts.set(c.displayName.toLowerCase(), c.messageCount);
  }

  // Compute median commit count for thresholds
  const commitValues = Object.values(commitsByAuthor);
  if (commitValues.length === 0) return insights;

  const sortedCommits = [...commitValues].sort((a, b) => a - b);
  const medianCommits = sortedCommits[Math.floor(sortedCommits.length / 2)];

  // Compute median Slack messages
  const slackValues = slackContributors.map((c) => c.messageCount);
  const sortedSlack = [...slackValues].sort((a, b) => a - b);
  const medianSlack = sortedSlack.length > 0 ? sortedSlack[Math.floor(sortedSlack.length / 2)] : 0;

  // "Silent builders" — above-median commits but well below median Slack activity
  const silentBuilders: string[] = [];
  for (const [author, commits] of Object.entries(commitsByAuthor)) {
    if (commits < medianCommits) continue;
    const authorLower = author.toLowerCase();
    const slackCount = slackCounts.get(authorLower) ?? 0;
    if (slackCount < medianSlack * 0.25) {
      silentBuilders.push(author);
    }
  }

  if (silentBuilders.length > 0) {
    insights.push({
      id: "silent-builders",
      title: "Active contributors with low communication presence",
      description: `${silentBuilders.length} contributor${silentBuilders.length === 1 ? " is" : "s are"} highly active in code but rarely communicate in Slack — potential knowledge silo risk.`,
      sources: ["github", "slack"],
      severity: "warning",
      metrics: {
        silentBuilderCount: silentBuilders.length,
        silentBuilders: silentBuilders.join(", "),
        medianCommits,
        medianSlackMessages: medianSlack,
      },
    });
  }

  // "Communicators" — high Slack but low/no code output
  const communicators: string[] = [];
  for (const contributor of slackContributors) {
    if (contributor.messageCount < medianSlack) continue;
    const authorLower = contributor.displayName.toLowerCase();
    // Check if they have significant code output
    let commitCount = 0;
    for (const [author, count] of Object.entries(commitsByAuthor)) {
      if (author.toLowerCase() === authorLower) {
        commitCount = count;
        break;
      }
    }
    if (commitCount < medianCommits * 0.25) {
      communicators.push(contributor.displayName);
    }
  }

  if (communicators.length > 0) {
    insights.push({
      id: "high-communicators-low-code",
      title: "High communicators with low code output",
      description: `${communicators.length} contributor${communicators.length === 1 ? " has" : "s have"} high Slack activity but low code output — may be PM/lead roles or context-switching heavily.`,
      sources: ["github", "slack"],
      severity: "info",
      metrics: {
        communicatorCount: communicators.length,
        communicators: communicators.join(", "),
      },
    });
  }

  return insights;
}

function checkReviewBottleneckCommunication(
  github: GitHubMetrics,
  slack: SlackMetrics
): CrossSourceInsight[] {
  const insights: CrossSourceInsight[] = [];

  const reviewsByReviewer = github.reviews.byReviewer;
  const totalReviews = github.reviews.total;
  if (totalReviews === 0) return insights;

  // Sort reviewers by review count descending
  const sortedReviewers = Object.entries(reviewsByReviewer).sort(
    (a, b) => b[1] - a[1]
  );

  if (sortedReviewers.length < 2) return insights;

  // Check if top 2 reviewers do > 60% of reviews
  const top2Reviews = sortedReviewers[0][1] + sortedReviewers[1][1];
  const top2Pct = Math.round((top2Reviews / totalReviews) * 100);

  if (top2Pct <= 60) return insights;

  // Check if those reviewers are also high Slack contributors
  const slackCounts = new Map<string, number>();
  for (const c of slack.topContributors) {
    slackCounts.set(c.displayName.toLowerCase(), c.messageCount);
  }

  const medianSlack =
    slack.topContributors.length > 0
      ? [...slack.topContributors.map((c) => c.messageCount)].sort((a, b) => a - b)[
          Math.floor(slack.topContributors.length / 2)
        ]
      : 0;

  const topReviewerNames = [sortedReviewers[0][0], sortedReviewers[1][0]];
  const highSlackReviewers = topReviewerNames.filter((name) => {
    const count = slackCounts.get(name.toLowerCase()) ?? 0;
    return count > medianSlack;
  });

  if (highSlackReviewers.length > 0) {
    insights.push({
      id: "review-bottleneck-communication",
      title: "Top reviewers are also most active communicators",
      description: `Top reviewers are also the most active communicators — context switching may be impacting review quality. Top 2 reviewers handle ${top2Pct}% of all reviews.`,
      sources: ["github", "slack"],
      severity: "warning",
      metrics: {
        top2ReviewPct: top2Pct,
        totalReviews,
        topReviewers: topReviewerNames.join(", "),
        highSlackReviewerCount: highSlackReviewers.length,
      },
    });
  }

  return insights;
}

function checkSprintDeliveryVsMeetingLoad(
  jira: JiraMetrics,
  calendar: GoogleCalendarMetrics
): CrossSourceInsight[] {
  const insights: CrossSourceInsight[] = [];

  const weeks = weeksInPeriod(calendar.period.since, calendar.period.until);
  const meetingHoursPerWeek = Math.round((calendar.meetings.totalHours / weeks) * 10) / 10;

  // Compute issue completion rate from Jira
  const totalIssues = jira.issues.total;
  if (totalIssues === 0) return insights;

  const completionRate = Math.round((jira.issues.completed / totalIssues) * 100);

  if (completionRate < 70 && meetingHoursPerWeek > 20) {
    insights.push({
      id: "sprint-delivery-vs-meetings",
      title: "Meeting overhead may be impacting sprint execution",
      description: `Issue completion rate is ${completionRate}% while meeting load is ${meetingHoursPerWeek}h/week — meeting overhead may be impacting sprint execution.`,
      sources: ["jira", "google"],
      severity: "warning",
      metrics: {
        completionRate,
        meetingHoursPerWeek,
        totalIssues,
        completedIssues: jira.issues.completed,
        inProgressIssues: jira.issues.inProgress,
      },
    });
  }

  return insights;
}

// ── Public API ──

/** Map integration enum names (e.g. "GOOGLE_CALENDAR") to data keys (e.g. "googleCalendar") */
function normalizeSourceKey(source: string): string {
  const map: Record<string, string> = {
    GITHUB: "github",
    SLACK: "slack",
    JIRA: "jira",
    LINEAR: "linear",
    GOOGLE_CALENDAR: "googleCalendar",
  };
  return map[source] || source.toLowerCase();
}

export function analyzeCrossSources(
  integrationData: IntegrationData,
  connectedSources: string[]
): CrossSourceAnalysis {
  const insights: CrossSourceInsight[] = [];

  // Normalize source names to data keys so lookups match
  const normalizedSources = connectedSources.map(normalizeSourceKey);
  const sourcesAnalyzed = normalizedSources.filter(
    (s) => integrationData[s] !== undefined && integrationData[s] !== null
  );

  const github = integrationData.github as GitHubMetrics | undefined;
  const slack = integrationData.slack as SlackMetrics | undefined;
  const calendar = integrationData.googleCalendar as GoogleCalendarMetrics | undefined;
  const jira = integrationData.jira as JiraMetrics | undefined;

  // 1. Meeting Load vs Shipping Velocity (Calendar + GitHub)
  if (has(sourcesAnalyzed, "googleCalendar", "github") && calendar && github) {
    insights.push(...checkMeetingLoadVsShipping(calendar, github));
  }

  // 2. Blocker-to-Ticket Cross-Reference (Slack + Jira)
  if (has(sourcesAnalyzed, "slack", "jira") && slack && jira) {
    insights.push(...checkBlockerToTicketCrossRef(slack, jira));
  }

  // 3. Contributor Activity Balance (GitHub + Slack)
  if (has(sourcesAnalyzed, "github", "slack") && github && slack) {
    insights.push(...checkContributorActivityBalance(github, slack));
  }

  // 4. Review Bottleneck + Communication (GitHub + Slack)
  if (has(sourcesAnalyzed, "github", "slack") && github && slack) {
    insights.push(...checkReviewBottleneckCommunication(github, slack));
  }

  // 5. Sprint Delivery vs Meeting Load (Jira + Calendar)
  if (has(sourcesAnalyzed, "jira", "googleCalendar") && jira && calendar) {
    insights.push(...checkSprintDeliveryVsMeetingLoad(jira, calendar));
  }

  return {
    insights,
    sourcesAnalyzed,
  };
}
