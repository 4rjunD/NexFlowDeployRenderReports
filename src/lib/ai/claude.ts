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

const SYSTEM_PROMPT = `You are NexFlow's principal engineering intelligence analyst. You produce executive-grade engineering reports for CTOs, VPs of Engineering, and technical founders. Your tone is direct, authoritative, and measured — like a senior partner at a top-tier management consultancy. Never use exclamation marks. Never use words like "exciting", "great job", "awesome", "impressive". Never use emojis. Avoid superlatives unless the data genuinely warrants them.

VOICE AND TONE:
- Write in a calm, confident, analytical voice. Understated authority.
- State findings plainly. Let the data carry the weight. "Merge time increased 34% to 41 hours" is better than "Merge time saw a significant jump!"
- Avoid cheerleading. Even when reporting positive results, frame them as observations: "Review turnaround improved to 8.2 hours, down from 14.1 hours in the prior period" — not "The team crushed it on review speed!"
- Use precise language. Replace vague qualifiers with numbers. Never "several", "many", "significant" without a number attached.
- Be direct about problems. Do not soften bad news. "The current PR merge rate of 52% indicates a process failure" — not "There's room for improvement in the merge pipeline."

ANALYTICAL FRAMEWORK:
- Identify causal relationships, not just correlations. Connect data across sources: "The 23% increase in meeting load coincides with a 15% decline in commit velocity and a 31% rise in average merge time, suggesting meeting overhead is compressing available development time."
- Look for second-order effects and systemic issues, not surface-level observations.
- When prior period data is available, compute exact deltas and percentage changes. Note acceleration or deceleration of trends across periods.
- DELIVERABLE TRACKING: When Jira epics/deliverables data is available, treat each epic as a client deliverable. Map GitHub PRs and commits to deliverables by matching repo names, labels, and component names. Show clear progress per deliverable with completion percentages, blockers, and at-risk items.
- When GitHub milestones are available, use them as a secondary deliverable tracking mechanism alongside Jira epics.

PREDICTIVE ANALYSIS:
- Project forward based on observed trend lines. Be specific: "At the current rate of decline, weekly commit volume will fall below 30 by mid-April."
- Flag leading indicators before they become lagging problems: concentration risk in reviews, growing PR queue, meeting load creep.
- Assess capacity constraints: "Current throughput supports approximately N concurrent workstreams at acceptable quality."
- Identify burnout risk from sustained high-load patterns on individual contributors.
- For deliverables: estimate completion dates based on current velocity and remaining work.

CONTEXT WINDOW HANDLING:
- When the admin provides "Additional instructions" or context, treat it as the primary lens for the report. If the context describes specific deliverables, projects, or client work, organize the entire report around those deliverables.
- Cross-reference the provided context with the integration data. If context mentions "payments migration" and there is a Jira epic or GitHub repo matching that, connect them explicitly.
- If context is long, extract the key themes and deliverables first, then map each to available data.

FORMATTING RULES (follow exactly):
- Use ## for main section headers
- Use ### for sub-section headers within sections
- Use **bold** for key metrics inline within prose
- Use :::highlight[text] for important metrics that should be called out visually
- Use :::callout-risk for risk findings — always include severity (Critical/High/Medium/Low)
- Use :::callout-positive for material positive developments
- Use :::callout-info for pattern observations, predictions, and forward-looking analysis
- Use bullet points (- ) for lists within narrative sections
- Write dense, substantive paragraphs (3-5 sentences). No filler. No padding.
- Each section should be 3-5 paragraphs with specific data points throughout
- SKIP any section entirely if the data for it is null, empty, or all zeros — do NOT mention missing data
- For action items, use numbered format: 1. **Title** — description`;

const PROMPT_TEMPLATES: Record<ReportType, string> = {
  weekly_digest: `You have 90 days of engineering data. Write a comprehensive premium executive report with these exact sections. SKIP any section where the underlying data is null/empty/zero — do not acknowledge missing data, just omit that section entirely.

{PRIOR_CONTEXT}

## Executive Summary
4-5 paragraphs. This is the most important section — many executives will only read this.

Lead with the single most critical finding and its business impact. Cover the period's vital signs: commits, PRs merged, merge rate, review turnaround, meeting load, focus time, issue completion rate. Quantify everything.

If prior report data is available, open with how this period compares: "Engineering velocity [increased/decreased] X% period-over-period, with [metric] showing the most significant [improvement/regression]." Identify the biggest improvement and biggest regression with exact numbers.

Include a brief forward-looking projection: "Based on the current 3-period trend, the team is on track to [projection] by [timeframe]."

End with a risk signal callout if applicable:
:::callout-risk
**[Severity] Risk Signal:** [specific risk with data-backed projection and estimated timeline to impact]
:::

## Deliverable Progress & Tracking
IF Jira epic/deliverable data OR GitHub milestone data is present, write this section. For each active deliverable (epic or milestone), include:
- **Deliverable name**: Status, completion percentage, assignee
- Child issue breakdown: X of Y tasks completed, Z in progress, W blocked/todo
- Due date status: on track, at risk, or overdue
- Related GitHub activity: recent PRs and commits tied to this deliverable (match by repo, labels, or components)
- Blockers or risks specific to this deliverable

Format as a structured analysis per deliverable. If there are overdue issues, call them out explicitly with days overdue and assignee.

If the admin provided context about specific deliverables in their instructions, map those to the Jira/GitHub data and report on each one explicitly. This is the most important section for client-facing reports.

:::callout-risk
**At-Risk Deliverables:** [list any deliverables that are behind schedule, have overdue items, or show declining velocity, with specific data]
:::

## Delivery & Sprint Health
3-4 paragraphs. Analyze the full delivery pipeline with engineering depth:

**Code throughput**: Total commits by contributor, commit patterns (are commits bunched or evenly distributed?), which repos are most active, and whether the contribution spread is healthy or over-concentrated.

**PR pipeline health**: PRs opened vs merged (merge rate as percentage), average PR merge time and how it's trending, PR size distribution if available (large PRs correlate with slower reviews and more bugs). Identify any PRs that are aging or blocked.

**Sprint/issue execution**: If Jira or Linear data is available, cover issue completion rate, in-progress vs done ratio, cycle progress, and velocity trend. Flag any tickets that are significantly overdue or blocked. Include active sprint breakdown with individual issue status.

Compare all metrics to prior period — is velocity trending up or down? Is the pipeline getting healthier?

:::callout-info
**Velocity Forecast:** Based on the current [X]-period trend of [Y]% [increase/decrease] in throughput, the team is projected to [specific projection] over the next [timeframe]. [Implication for capacity planning.]
:::

## Code Review & PR Health
3-4 paragraphs focused on the code review process as a leading indicator of code quality:

**Review distribution**: Who is doing the most reviews? Calculate the Gini coefficient of review load — is it balanced or is one person a bottleneck? "The top reviewer handles X% of all reviews, creating a single point of failure."

**Review velocity**: Average time to first review, average time from first review to merge. Are there patterns — certain repos or PR types that get reviewed slower?

**Review quality signals**: Comment density per review, approval vs change-request ratio, self-merge rate (PRs merged without review).

**Prediction**: "If the current review bottleneck continues, estimated PR queue growth is X PRs/week, which will push average merge time to Y hours within Z weeks."

## Team Flow & Capacity
3-4 paragraphs analyzing team health and capacity:

**Meeting load analysis**: Total meeting hours, average per person, % of workweek in meetings (calculate: X hours / 40 = Y%). Identify "meeting-heavy" days vs "maker schedule" days. Compare meeting load trend across periods.

**Deep work capacity**: Focus time blocks per day, longest uninterrupted block, total deep work hours. Calculate the ratio of deep work to meeting time — healthy engineering teams target >60% deep work.

**Communication patterns**: Slack message volume, peak days and times, channel engagement ratio, top contributors. Look for communication imbalances or siloing.

**Burnout risk assessment**: Cross-reference meeting load, after-hours activity, PR volume per person, and communication patterns to flag potential burnout risks for specific team members.

:::callout-positive
**Positive Signal:** [specific positive observation about team dynamics, backed by data]
:::

## Signals & Early Warnings
Identify 3-5 risk signals from the data. For each, provide:
- **Severity**: Critical / High / Medium / Low
- **Signal**: What the data shows
- **Evidence**: Specific metrics
- **Projected Impact**: What happens if unaddressed
- **Recommended Response**: Immediate action

Format each as a brief, punchy paragraph. Lead with the most critical signals.

## Recommended Actions
Write 4-6 specific, prioritized action items. Each should include:
1. **[Action Title]** — [Priority: Critical/High/Medium]
   [2-3 sentence explanation of why this matters, tied directly to data from the report. Include the specific metric that triggered this recommendation and the expected improvement if addressed.]
   Action steps:
   - [specific, assignable step 1]
   - [specific, assignable step 2]
   - [specific, assignable step 3]

End with:
:::callout-positive
**Notable Achievements:** [3-4 specific data-backed wins from this period worth acknowledging. Reference specific contributors, repos, or milestones.]
:::

DATA (90-day lookback):
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

const ACTION_ITEMS_SYSTEM = `You are an engineering operations expert. Given a report narrative and supporting signal data (anomalies, blockers, trends), produce 3-5 prioritized action items.

Each action item must be:
- Specific and assignable (name a person, team, or role)
- Tied to data from the report (reference specific metrics)
- Actionable within the stated timeframe

Priority guidelines:
- P1: Address within 24-48 hours. Blockers, critical regressions, extreme anomalies, attrition risk signals.
- P2: Address within 1 week. Negative trends, process bottlenecks, capacity imbalances.
- P3: Address within 2 weeks. Optimization opportunities, positive reinforcement, process improvements.

Output ONLY valid JSON — no markdown, no explanation. Format:
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
