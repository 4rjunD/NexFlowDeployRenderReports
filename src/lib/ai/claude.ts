// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — AI Narrative Generation (Claude)
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { AnomalyReport } from "@/lib/signals/anomaly";
import type { BlockerReport } from "@/lib/integrations/slack/blockers";
import type { TrendReport } from "@/lib/signals/trends";
import { analyzeCodeChurn } from "@/lib/signals/code-churn";

const anthropic = new Anthropic();

type ReportType = "weekly_digest" | "sprint_risk" | "monthly_health";

export interface PriorContext {
  periodStart: string;
  periodEnd: string;
  keyMetrics: Record<string, number | string>;
  insights: string[];
  actionItems?: ActionItem[];
  connectedSources?: string[];
}

export interface ActionItem {
  priority: "P1" | "P2" | "P3";
  title: string;
  description: string;
  relatedMetrics: string[];
  suggestedOwner?: string;
}

const SYSTEM_PROMPT = `You are the NexFlow consulting team, a fractional engineering advisory practice. Think of yourself as a senior operator who's scaled 3-4 startups from Series A through growth. You write action briefs that go DIRECTLY to your clients: CTOs, founders, and engineering leads at 20 to 200 person teams.

CRITICAL: This report goes to the CLIENT. You are their external advisor. Never refer to the client as a third party. Never say "schedule a meeting with [their name]" because they are reading this. Instead, say "we'll walk through this on our next call" or "book a session with NexFlow to address this." Frame NexFlow as the consulting partner helping them.

Your job: surface non-obvious insights, then tell the reader exactly what to do about them. Not "consider reviewing". Tell them the specific action and what the expected outcome is. Every insight earns its place by connecting to shipping speed, retention risk, quality, or cost.

VOICE AND TONE:
- Advisor to client. You're the trusted consultant who says the thing nobody else will. Warm but direct. Zero corporate fluff.
- Lead with the insight, back it up with data. "Your team is shipping code but nobody's reviewing it" beats "The review-to-PR ratio is 0.12."
- Frame recommendations as "here's what we'd recommend." Be specific about what the client can do themselves vs what NexFlow will help with on the next call.
- Reference startup realities: limited headcount, need to move fast, can't afford to waste cycles on process theater.
- Be honest about problems but constructive: "Here's what's happening, here's why it matters, and here's the fix. It'll take about 30 minutes."
- Never use exclamation marks, emojis, or cheerleading language ("great job", "awesome", "crushing it").
- NEVER use em dashes. Use periods, commas, or colons instead.

AUDIENCE:
- Your client may be non-technical. They could be a founder, product lead, or business operator who doesn't write code.
- Never assume they know technical jargon. Explain "pull request" as "a review checkpoint before changes go live."
- Frame everything in terms of BUSINESS IMPACT: money, time, risk to the product, customer experience, ability to hire/scale.
- Don't state obvious things ("you're the only developer"). They know that. Instead, explain the non-obvious CONSEQUENCES they haven't thought about.

ANALYTICAL APPROACH:
- Surface patterns a human would miss. Focus on the business cost of technical decisions.
- Always answer "so what does this mean for my business?", not just "so what?"
- When data is limited (1-2 connected sources), go deeper into what's available. A GitHub-only report should still deliver 3-4 compelling insights about business risk, investor readiness, and operational efficiency.
- NEVER mention missing data or unconnected sources. Only write about what you can see.
- When prior period data is available, highlight what changed and why it matters.
- For every problem, estimate the business cost: "If a client needs an urgent fix while you're on vacation, that's a missed revenue opportunity, not just a delayed commit."

WHAT MAKES A GREAT INSIGHT:
- "Your product has no rollback capability. If an update breaks something for customers, the only fix is writing more code under pressure. That's the exact scenario that creates more bugs."
- "There's no record of what was built or why. When you pitch investors and they ask about your development velocity, you'll be guessing instead of showing data."
- "Your two codebases aren't linked. A change in one could silently break the other. This is the #1 cause of 'it worked yesterday' bugs."
- NOT: "There were 9 commits this week" (that's a stat, not an insight)
- NOT: "You should add more contributors" (that's obvious, not helpful)

FORMATTING RULES (follow exactly):
- Use ## for main section headers
- Use ### for sub-section headers within sections
- Use **bold** for key metrics inline within prose
- Use :::highlight[text] for important metrics that should be called out visually
- Use :::callout-risk for risk findings. Always include why it matters, estimated cost of inaction, and specific fix
- Use :::callout-positive for wins worth celebrating (briefly, one sentence)
- Use :::callout-info for specific, implementable recommendations with expected outcome
- Write in short, punchy paragraphs (2-3 sentences max). No walls of text.
- SKIP any section entirely if the data for it is null, empty, or all zeros. Do NOT mention missing data
- For action items, use numbered format: 1. **Title**: description with estimated time investment and expected metric impact
- NEVER use em dashes (the long dash). Use periods, commas, or colons instead.`;

const PROMPT_TEMPLATES: Record<ReportType, string> = {
  weekly_digest: `Write a weekly action brief. Your goal: 3-5 non-obvious insights the executive wouldn't find on their own, each paired with a specific, implementable action. SKIP any section where the data is null/empty/zero. Never mention missing sources. Never use em dashes.

{PRIOR_CONTEXT}

## The Big Picture
2-3 short paragraphs. Lead with the single most important thing happening right now. The insight that would make a CTO say "I didn't know that." Back it up with data but keep it conversational.

If prior data exists, highlight the most meaningful change: what got better, what got worse, and what to do about it right now.

## Key Discoveries
This is the heart of the brief. Write 3-5 discovery sections, each as its own ### subsection. Each discovery must be:
- A non-obvious insight (not a metric restatement)
- Backed by specific data
- Connected to a business outcome (shipping speed, cost, retention risk, quality)
- Paired with a specific action including: who should do it, estimated time (~30 min, ~2h, etc.), and expected metric impact

Example discoveries (adapt to actual data):
- ### Review Bottleneck Risk: "Two engineers handle 80% of reviews. If either takes PTO, your merge pipeline stops." Action: rotate review assignments this sprint (~30 min setup), expect merge time to drop from 36h to sub-24h within 2 weeks.
- ### Meeting Creep: "34% of the week is meetings. That's costing ~$12K/week in engineering time." Action: cancel the bottom 3 recurring meetings, reclaim ~6h/week per engineer.
- ### Silent Contributors: "Three team members had zero PR activity. Worth a 1-on-1." Action: schedule 15-min check-ins this week to understand blockers.

For each discovery, end with:
:::callout-info
**If I were you, I'd:** [Specific action with time estimate and expected outcome. Say exactly what to do.]
:::

Use :::callout-risk for problems (include cost of inaction) and :::callout-positive for wins (one sentence, keep it brief).

## What to Do This Week
3-5 prioritized actions, ranked by ROI (impact per hour invested). Be specific. Name the metric, the target, the owner, the time investment, and the expected result.

1. **[Action]** (~time): [Why it matters + expected metric impact. Frame as ROI: "Spend 30 min doing X to save ~4h/week in Y."]

End with one genuine positive observation:
:::callout-positive
**Worth celebrating:** [One specific, data-backed win. Keep it brief and authentic.]
:::

DATA:
{DATA}`,

  sprint_risk: `Analyze this sprint data and write a comprehensive risk assessment:

{PRIOR_CONTEXT}

## Sprint Risk Overview
Overall risk level and key drivers. Quantify risk on a 1-10 scale with specific justification.

## Risk Signal Analysis
Each risk ranked by severity with specific data, projected impact timeline, and mitigation strategy.

## Velocity & Capacity Forecast
Based on current sprint data, project completion likelihood and capacity constraints.

## Recommended Actions
5 prioritized actions with specific steps, owners, and expected impact.

DATA:
{DATA}`,

  monthly_health: `Write a comprehensive monthly engineering health report:

{PRIOR_CONTEXT}

## Monthly Health Overview
Executive summary of team health across all dimensions. Include month-over-month trends.

## Delivery & Velocity
Sprint completion trends, cycle time analysis, throughput forecasting.

## Quality & Process
Review quality metrics, deployment health, technical debt indicators.

## Team Dynamics & Capacity
Communication health, workload balance, burnout risk assessment, focus time analysis.

## Predictive Outlook
Forward-looking projections for the next month based on current trends.

## Strategic Recommendations
3-5 strategic actions for next month with expected ROI and priority ranking.

DATA:
{DATA}`,
};

const FALLBACK_NARRATIVES: Record<ReportType, string> = {
  weekly_digest:
    "## Executive Summary\n\nEngineering data for the past 90 days has been compiled from connected integrations. The structured data sections below contain detailed breakdowns of development activity, team communication, project progress, and time management.\n\n## Recommended Actions\n\n1. **Review the data sections below** — All metrics are pulled from live integration data\n2. **Identify trends** — Compare this period's metrics against your team's baselines\n3. **Contact your NexFlow administrator** — For questions about this report",
  sprint_risk:
    "## Sprint Risk Assessment\n\nSprint risk signals have been computed from available data. Review the structured data sections for detailed breakdowns.",
  monthly_health:
    "## Monthly Health Summary\n\nMonthly health metrics have been compiled. Review the data sections for detailed analysis.",
};

function buildPriorContextBlock(priorContexts: PriorContext[]): string {
  if (!priorContexts || priorContexts.length === 0) {
    return "";
  }

  let block = `PRIOR REPORT CONTEXT (use these for quantitative trend comparisons — calculate exact deltas and percentage changes):\n`;
  for (let i = 0; i < priorContexts.length; i++) {
    const ctx = priorContexts[i];
    const label = i === 0 ? "Most Recent Prior Report" : `${i + 1} Reports Ago`;
    block += `\n--- ${label} (${ctx.periodStart} to ${ctx.periodEnd}) ---\n`;
    block += `Key Metrics:\n`;
    for (const [key, value] of Object.entries(ctx.keyMetrics)) {
      block += `  ${key}: ${value}\n`;
    }
    if (ctx.insights.length > 0) {
      block += `Key Insights from that period:\n`;
      for (const insight of ctx.insights) {
        block += `  - ${insight}\n`;
      }
    }
  }
  block += `\nIMPORTANT: Calculate exact percentage changes between current metrics and prior period metrics. Identify acceleration/deceleration patterns across all available periods.\n`;

  // Prior action items for follow-up tracking
  const priorActions = priorContexts[0]?.actionItems;
  if (priorActions && priorActions.length > 0) {
    block += `\nPRIOR ACTION ITEMS (from the most recent report — assess whether each was addressed based on current metric changes):\n`;
    for (const item of priorActions) {
      block += `  - [${item.priority}] ${item.title}: ${item.description}\n`;
      if (item.relatedMetrics?.length > 0) {
        block += `    Related metrics: ${item.relatedMetrics.join(", ")}\n`;
      }
    }
    block += `\nIMPORTANT: In the Executive Summary, include a brief "Progress on Prior Recommendations" assessment. For each prior action item, determine if the related metrics improved, stayed the same, or worsened. Mark each as ADDRESSED, PARTIAL, or NOT ADDRESSED with supporting data.\n`;
  }

  return block;
}

function buildSourceDepthInstruction(connectedSources: string[]): string {
  const count = connectedSources.length;
  const sources = connectedSources.join(", ");

  if (count === 1) {
    return `\nSOURCE DEPTH: Only 1 source connected (${sources}). Go DEEP into this source. Produce 5-6 detailed discovery sections covering every angle the data supports. Analyze contributor patterns, time patterns, distribution anomalies, aging items, concentration risks, and forward projections. Make every section a discovery the client couldn't find from their own dashboard.`;
  }
  if (count === 2) {
    return `\nSOURCE DEPTH: 2 sources connected (${sources}). Produce 3-4 discovery sections per source PLUS 1 cross-source correlation section. Look for relationships between the two data sources — e.g., meeting load vs shipping velocity, or Slack blocker mentions vs stalled tickets.`;
  }
  return `\nSOURCE DEPTH: ${count} sources connected (${sources}). Produce 2-3 key discovery sections per source PLUS 2 cross-source insight sections. Focus on the most impactful findings and cross-source correlations.`;
}

function buildAnomaliesBlock(anomalies?: AnomalyReport): string {
  if (!anomalies) return "";
  const parts: string[] = [];

  if (anomalies.contributorAnomalies.length > 0) {
    parts.push("CONTRIBUTOR ANOMALIES DETECTED (statistical outliers vs team distribution, z-score ≥ 2.0):");
    for (const a of anomalies.contributorAnomalies) {
      parts.push(`  - ${a.contributor}: ${a.label} = ${a.currentValue} (team mean: ${a.baselineMean}, z-score: ${a.zScore}, ${a.severity} ${a.direction} anomaly)`);
    }
  }

  if (anomalies.teamTrends.length > 0) {
    parts.push("\nTEAM-LEVEL ANOMALIES (vs historical periods):");
    for (const t of anomalies.teamTrends) {
      parts.push(`  - ${t.label}: current ${t.currentValue} vs historical mean ${t.historicalMean} (z-score: ${t.zScore}, ${t.severity} ${t.direction})`);
    }
  }

  if (parts.length === 0) return "";
  parts.push("\nIMPORTANT: Weave these anomalies into the relevant narrative sections as discoveries. Frame contributor anomalies as sudden changes worth investigating, not performance judgments. Highlight positive anomalies as wins.");
  return parts.join("\n");
}

function buildBlockersBlock(blockers?: BlockerReport): string {
  if (!blockers || blockers.blockers.length === 0) return "";

  const parts = [
    `BLOCKER SIGNALS DETECTED (${blockers.blockers.length} blocker mentions found in Slack across ${blockers.channelsScanned} channels):`,
  ];

  const highConf = blockers.blockers.filter(b => b.confidence === "high");
  const medConf = blockers.blockers.filter(b => b.confidence === "medium");

  if (highConf.length > 0) {
    parts.push("\nHigh-confidence blockers (matched to known Jira tickets):");
    for (const b of highConf.slice(0, 10)) {
      parts.push(`  - [${b.channelName}] "${b.messageSnippet}" (keyword: "${b.matchedKeyword}", tickets: ${b.referencedTickets.join(", ")}, ${b.timestamp})`);
    }
  }

  if (medConf.length > 0) {
    parts.push("\nMedium-confidence blockers:");
    for (const b of medConf.slice(0, 8)) {
      parts.push(`  - [${b.channelName}] "${b.messageSnippet}" (keyword: "${b.matchedKeyword}", ${b.timestamp})`);
    }
  }

  parts.push("\nIMPORTANT: Reference these blockers in the Signals & Early Warnings and Deliverable sections. Cross-reference with stalled Jira tickets or aging PRs. This is high-value data that teams cannot easily see without cross-source analysis.");
  return parts.join("\n");
}

function buildTrendsBlock(trends?: TrendReport): string {
  if (!trends || trends.trends.length === 0) return "";

  const parts = [
    `PERIOD-OVER-PERIOD TRENDS (${trends.periodsCompared} prior period(s) compared):`,
  ];

  const significant = trends.trends.filter(t => Math.abs(t.pctChange) >= 5);
  if (significant.length === 0) return "";

  for (const t of significant.slice(0, 15)) {
    const arrow = t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : "→";
    const sentiment = t.isPositive ? "(positive)" : "(negative)";
    parts.push(`  ${arrow} ${t.label}: ${t.priorValue} → ${t.currentValue} (${t.pctChange > 0 ? "+" : ""}${t.pctChange}%) ${sentiment}`);
  }

  parts.push("\nIMPORTANT: Lead the Executive Summary with the most significant trend changes. Use exact numbers: 'PR merge rate improved from X to Y, a Z% increase.' Call out any negative trends as risk signals.");
  return parts.join("\n");
}

export async function generateNarrative(
  type: ReportType,
  data: unknown,
  customInstruction?: string,
  priorContexts?: PriorContext[],
  signals?: {
    anomalies?: AnomalyReport;
    blockers?: BlockerReport;
    trends?: TrendReport;
  },
  connectedSources?: string[]
): Promise<string> {
  try {
    const promptTemplate = PROMPT_TEMPLATES[type];
    const priorBlock = buildPriorContextBlock(priorContexts || []);

    // Build signal blocks
    const anomaliesBlock = buildAnomaliesBlock(signals?.anomalies);
    const blockersBlock = buildBlockersBlock(signals?.blockers);
    const trendsBlock = buildTrendsBlock(signals?.trends);
    const signalBlocks = [anomaliesBlock, blockersBlock, trendsBlock]
      .filter(Boolean)
      .join("\n\n");

    // Source-aware depth scaling
    const depthInstruction = connectedSources
      ? buildSourceDepthInstruction(connectedSources)
      : "";

    let prompt = promptTemplate
      .replace("{DATA}", JSON.stringify(data, null, 2))
      .replace("{PRIOR_CONTEXT}", priorBlock);

    if (depthInstruction) {
      prompt += depthInstruction;
    }

    if (signalBlocks) {
      prompt += `\n\nSIGNAL ANALYSIS (pre-computed from the data above — incorporate these findings into the narrative):\n\n${signalBlocks}`;
    }

    if (customInstruction) {
      prompt += `\n\nAdditional instructions from the admin: ${customInstruction}`;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (textBlock && textBlock.type === "text") {
      return textBlock.text;
    }

    return FALLBACK_NARRATIVES[type];
  } catch (error) {
    console.error(
      `[NexFlow AI] Failed to generate ${type} narrative:`,
      error
    );
    return FALLBACK_NARRATIVES[type];
  }
}

// ─────────────────────────────────────────────────────────────
// Action Items — Second Claude pass for specific, prioritized actions
// ─────────────────────────────────────────────────────────────

const ACTION_ITEMS_SYSTEM = `You are NexFlow, a fractional engineering consulting team. This report goes directly to a CLIENT who may be NON-TECHNICAL (founder, product lead, business operator).

Given a report narrative and signal data, produce 3-5 action items.

CRITICAL RULES:
- The reader IS the client. Never say "schedule a meeting with [their name]" because they are reading this.
- The client may NOT know how to do technical tasks. For anything technical, say "NexFlow will handle this on your next call" or "We'll set this up together. You just need to give us access."
- For business decisions only the client can make, be specific: "Decide whether [product A] and [product B] should share a codebase. We'll explain the tradeoffs on our call."
- NEVER state the obvious ("you need more developers"). Instead, explain the non-obvious business consequence and the specific next step.
- Don't use jargon without explaining it. "Branch protection" means "a safety setting that prevents untested changes from going live."
- suggestedOwner: "NexFlow (on your next call)", "You (business decision)", or "NexFlow + You"
- Frame as business ROI: "This prevents the scenario where a bad update breaks your product and you can't undo it"
- Written in warm, clear consulting voice. Like explaining to a smart friend who doesn't code.
- NEVER use em dashes (the long dash). Use periods, commas, or colons instead.

Priority guidelines:
- P1: This week. Things that could hurt your product or business right now.
- P2: This month. Things that will slow you down as you grow.
- P3: When ready. Strategic improvements for scale.

Output ONLY valid JSON. No markdown, no explanation. Format:
[{"priority":"P1","title":"...","description":"...","relatedMetrics":["..."],"suggestedOwner":"..."}]`;

export async function generateActionItems(
  narrative: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integrationData: Record<string, any>,
  signals?: {
    anomalies?: AnomalyReport;
    blockers?: BlockerReport;
    trends?: TrendReport;
  }
): Promise<ActionItem[]> {
  try {
    // Build a compact summary for the action items prompt
    const signalSummary: string[] = [];

    if (signals?.anomalies?.contributorAnomalies.length) {
      signalSummary.push("Anomalies: " + signals.anomalies.contributorAnomalies
        .slice(0, 5)
        .map(a => `${a.contributor} ${a.label} z=${a.zScore}`)
        .join("; "));
    }

    if (signals?.blockers?.blockers.length) {
      signalSummary.push("Blockers: " + signals.blockers.blockers
        .slice(0, 5)
        .map(b => `"${b.matchedKeyword}" in #${b.channelName}${b.referencedTickets.length ? ` (${b.referencedTickets.join(",")})` : ""}`)
        .join("; "));
    }

    if (signals?.trends?.trends.length) {
      const negTrends = signals.trends.trends.filter(t => !t.isPositive);
      if (negTrends.length) {
        signalSummary.push("Negative trends: " + negTrends
          .slice(0, 5)
          .map(t => `${t.label} ${t.pctChange > 0 ? "+" : ""}${t.pctChange}%`)
          .join("; "));
      }
    }

    // Truncate narrative to save tokens
    const truncatedNarrative = narrative.length > 4000
      ? narrative.slice(0, 4000) + "\n...[truncated]"
      : narrative;

    const prompt = `Based on this engineering report narrative and signal data, generate 3-5 prioritized action items.

NARRATIVE:
${truncatedNarrative}

SIGNAL DATA:
${signalSummary.join("\n") || "No pre-computed signals available."}

Output ONLY the JSON array.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: ACTION_ITEMS_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    // Parse JSON — handle potential markdown wrapping
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: ActionItem) => ({
      priority: item.priority || "P3",
      title: item.title || "Untitled action",
      description: item.description || "",
      relatedMetrics: item.relatedMetrics || [],
      suggestedOwner: item.suggestedOwner,
    }));
  } catch (error) {
    console.error("[NexFlow AI] Failed to generate action items:", error);
    return [];
  }
}

// Extract key metrics from integration data for context persistence
export function extractKeyMetrics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integrationData: Record<string, any>
): Record<string, number | string> {
  const metrics: Record<string, number | string> = {};

  // GitHub metrics
  const gh = integrationData.github;
  if (gh) {
    if (gh.commits?.total != null) metrics.totalCommits = gh.commits.total;
    if (gh.pullRequests?.opened != null) metrics.prsOpened = gh.pullRequests.opened;
    if (gh.pullRequests?.merged != null) metrics.prsMerged = gh.pullRequests.merged;
    if (gh.pullRequests?.closed != null) metrics.prsClosed = gh.pullRequests.closed;
    if (gh.pullRequests?.avgMergeTimeHours != null) metrics.avgPrMergeTimeHours = gh.pullRequests.avgMergeTimeHours;
    if (gh.pullRequests?.stalePrs != null) metrics.stalePrCount = gh.pullRequests.stalePrs.length;
    if (gh.pullRequests?.avgPrSizeLines != null) metrics.avgPrSizeLines = gh.pullRequests.avgPrSizeLines;
    if (gh.reviews?.total != null) metrics.totalReviews = gh.reviews.total;
    if (gh.reviews?.avgTurnaroundTimeHours != null) metrics.avgReviewTurnaroundHours = gh.reviews.avgTurnaroundTimeHours;
    if (gh.reviews?.comments != null) metrics.reviewComments = gh.reviews.comments;
    // Derived metrics
    if (gh.pullRequests?.opened > 0) {
      metrics.prMergeRate = Math.round((gh.pullRequests.merged / gh.pullRequests.opened) * 100);
    }
    if (gh.repos) metrics.repoCount = gh.repos.length;
    // Contributor count
    if (gh.pullRequests?.openedByAuthor) {
      metrics.activeContributors = Object.keys(gh.pullRequests.openedByAuthor).length;
    }
    // Review concentration — % of reviews done by top 2 reviewers
    const byReviewer = gh.reviews?.byReviewer;
    if (byReviewer && typeof byReviewer === "object") {
      const reviewCounts = Object.values(byReviewer).map((v) => typeof v === "number" ? v : 0).sort((a, b) => b - a);
      const totalR = reviewCounts.reduce((a, b) => a + b, 0);
      if (totalR > 0 && reviewCounts.length >= 2) {
        metrics.reviewConcentrationPct = Math.round(((reviewCounts[0] + reviewCounts[1]) / totalR) * 100);
      }
    }
    // Code churn metrics
    const churn = analyzeCodeChurn(gh);
    metrics.netLinesAdded = churn.netLinesAdded;
    metrics.churnRatio = churn.churnRatio;
    metrics.largePrCount = churn.largePrCount;
  }

  // Jira metrics
  const jr = integrationData.jira;
  if (jr) {
    if (jr.issues?.total != null) metrics.jiraIssuesTotal = jr.issues.total;
    if (jr.issues?.completed != null) metrics.jiraIssuesCompleted = jr.issues.completed;
    if (jr.issues?.total > 0 && jr.issues?.completed != null) {
      metrics.jiraCompletionRate = Math.round((jr.issues.completed / jr.issues.total) * 100);
    }
    if (jr.issues?.avgResolutionTimeHours != null) metrics.jiraAvgResolutionHours = jr.issues.avgResolutionTimeHours;
    if (jr.deliverables) metrics.activeDeliverables = jr.deliverables.filter((d: { statusCategory: string }) => d.statusCategory !== "done").length;
    if (jr.issues?.overdue) metrics.overdueIssues = jr.issues.overdue.length;
  }

  // Linear metrics
  const ln = integrationData.linear;
  if (ln) {
    if (ln.issues?.total != null) metrics.issuesTotal = ln.issues.total;
    if (ln.issues?.completed != null) metrics.issuesCompleted = ln.issues.completed;
    if (ln.issues?.total > 0 && ln.issues?.completed != null) {
      metrics.issueCompletionRate = Math.round((ln.issues.completed / ln.issues.total) * 100);
    }
  }

  // GitHub issues/milestones
  if (gh?.issues?.total != null && gh.issues.total > 0) {
    metrics.ghIssuesTotal = gh.issues.total;
    metrics.ghIssuesOpen = gh.issues.open;
    metrics.ghIssuesClosed = gh.issues.closed;
  }
  if (gh?.milestones?.length > 0) {
    metrics.ghActiveMilestones = gh.milestones.filter((m: { state: string }) => m.state === "open").length;
  }

  // Slack metrics
  const sl = integrationData.slack;
  if (sl) {
    if (sl.totalMessages != null) metrics.slackMessages = sl.totalMessages;
    if (sl.activeChannels != null) metrics.activeSlackChannels = sl.activeChannels;
    if (sl.avgThreadResponseMinutes != null) metrics.avgThreadResponseMinutes = sl.avgThreadResponseMinutes;
    if (sl.afterHoursMessagePct != null) metrics.afterHoursMessagePct = sl.afterHoursMessagePct;
  }

  // Google Calendar metrics
  const gc = integrationData.googleCalendar;
  if (gc) {
    if (gc.meetings?.totalHours != null) metrics.totalMeetingHours = gc.meetings.totalHours;
    if (gc.meetings?.total != null) metrics.totalMeetings = gc.meetings.total;
    const ft = gc.focusTime;
    if (ft) {
      const avgFocus = typeof ft === "number" ? ft : ft.avgFocusHoursPerDay;
      if (avgFocus != null) metrics.avgFocusHoursPerDay = avgFocus;
    }
    if (gc.meetingCostEstimate != null) metrics.meetingCostEstimate = gc.meetingCostEstimate;
    if (gc.recurringMeetingPct != null) metrics.recurringMeetingPct = gc.recurringMeetingPct;
  }

  return metrics;
}

// Extract key insights from the AI narrative for context persistence
export function extractInsights(narrative: string): string[] {
  const insights: string[] = [];

  // Extract callout-risk content
  const riskMatches = narrative.match(/:::callout-risk\n([\s\S]*?):::/g);
  if (riskMatches) {
    for (const match of riskMatches) {
      const content = match.replace(/:::callout-risk\n/, "").replace(/:::$/, "").trim();
      if (content) insights.push(`[RISK] ${content.replace(/\*\*/g, "")}`);
    }
  }

  // Extract callout-positive content
  const positiveMatches = narrative.match(/:::callout-positive\n([\s\S]*?):::/g);
  if (positiveMatches) {
    for (const match of positiveMatches) {
      const content = match.replace(/:::callout-positive\n/, "").replace(/:::$/, "").trim();
      if (content) insights.push(`[WIN] ${content.replace(/\*\*/g, "")}`);
    }
  }

  // Extract callout-info content (predictions and patterns)
  const infoMatches = narrative.match(/:::callout-info\n([\s\S]*?):::/g);
  if (infoMatches) {
    for (const match of infoMatches) {
      const content = match.replace(/:::callout-info\n/, "").replace(/:::$/, "").trim();
      if (content) insights.push(`[PATTERN] ${content.replace(/\*\*/g, "")}`);
    }
  }

  // Keep only first 10 insights to stay concise
  return insights.slice(0, 10);
}
