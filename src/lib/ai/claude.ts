// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — AI Narrative Generation (Claude)
// ─────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

type ReportType = "weekly_digest" | "sprint_risk" | "monthly_health";

export interface PriorContext {
  periodStart: string;
  periodEnd: string;
  keyMetrics: Record<string, number | string>;
  insights: string[];
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

PREDICTIVE ANALYSIS:
- Project forward based on observed trend lines. Be specific: "At the current rate of decline, weekly commit volume will fall below 30 by mid-April."
- Flag leading indicators before they become lagging problems: concentration risk in reviews, growing PR queue, meeting load creep.
- Assess capacity constraints: "Current throughput supports approximately N concurrent workstreams at acceptable quality."
- Identify burnout risk from sustained high-load patterns on individual contributors.

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

## Delivery & Sprint Health
3-4 paragraphs. Analyze the full delivery pipeline with engineering depth:

**Code throughput**: Total commits by contributor, commit patterns (are commits bunched or evenly distributed?), which repos are most active, and whether the contribution spread is healthy or over-concentrated.

**PR pipeline health**: PRs opened vs merged (merge rate as percentage), average PR merge time and how it's trending, PR size distribution if available (large PRs correlate with slower reviews and more bugs). Identify any PRs that are aging or blocked.

**Sprint/issue execution**: If Linear data is available, cover issue completion rate, in-progress vs done ratio, cycle progress, and velocity trend. Flag any tickets that are significantly overdue or blocked.

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
  return block;
}

export async function generateNarrative(
  type: ReportType,
  data: unknown,
  customInstruction?: string,
  priorContexts?: PriorContext[]
): Promise<string> {
  try {
    const promptTemplate = PROMPT_TEMPLATES[type];
    const priorBlock = buildPriorContextBlock(priorContexts || []);
    let prompt = promptTemplate
      .replace("{DATA}", JSON.stringify(data, null, 2))
      .replace("{PRIOR_CONTEXT}", priorBlock);

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

  // Slack metrics
  const sl = integrationData.slack;
  if (sl) {
    if (sl.totalMessages != null) metrics.slackMessages = sl.totalMessages;
    if (sl.activeChannels != null) metrics.activeSlackChannels = sl.activeChannels;
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
