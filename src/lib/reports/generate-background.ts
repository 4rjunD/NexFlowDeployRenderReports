// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Shared Background Report Generation
// Extracted from the generate API route for reuse by cron jobs
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";
import { decryptToken } from "@/lib/crypto";
import {
  generateNarrative,
  generateActionItems,
  extractKeyMetrics,
  extractInsights,
  type PriorContext,
  type ActionItem,
} from "@/lib/ai/claude";
import { computeHealthScore } from "@/lib/scoring/health-score";
import { detectAnomalies } from "@/lib/signals/anomaly";
import { computeTrends } from "@/lib/signals/trends";
import { detectSlackBlockers } from "@/lib/integrations/slack/blockers";
import { analyzeCodeChurn } from "@/lib/signals/code-churn";
import { computeSprintVelocityForecast, detectSprintCarryOver } from "@/lib/signals/sprint-intelligence";
import { analyzeCrossSources } from "@/lib/signals/cross-source";
import { computeProgression, computeBenchmarks } from "@/lib/signals/progression";
import { notifyAdminsReportReady } from "@/lib/notifications/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetricsResult = any;

// ---------------------------------------------------------------------------
// Integration metric collectors (with graceful fallback)
// ---------------------------------------------------------------------------

export async function tryCollectSlackMetrics(accessToken: string, since: Date): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/slack/metrics");
    return await mod.collectSlackMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Slack metrics:", (error as Error).message);
    return null;
  }
}

export async function tryCollectGithubMetrics(accessToken: string, since: string, selectedRepos?: string[]): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/github/metrics");
    return await mod.collectGithubMetrics(accessToken, since, selectedRepos);
  } catch (error) {
    console.warn("[NexFlow] GitHub metrics:", (error as Error).message);
    return null;
  }
}

export async function tryCollectLinearMetrics(accessToken: string, since: string): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/linear/metrics");
    return await mod.collectLinearMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Linear metrics:", (error as Error).message);
    return null;
  }
}

export async function tryCollectJiraMetrics(accessToken: string, since: string): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/jira/metrics");
    return await mod.collectJiraMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Jira metrics:", (error as Error).message);
    return null;
  }
}

export async function tryCollectGoogleCalendarMetrics(accessToken: string, since: string): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/google/metrics");
    return await mod.collectGoogleCalendarMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Google Calendar metrics:", (error as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch prior report contexts for trend comparison
// ---------------------------------------------------------------------------

export async function fetchPriorContexts(orgId: string, limit = 3): Promise<PriorContext[]> {
  try {
    const contexts = await prisma.reportContext.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return contexts.map((ctx) => ({
      periodStart: ctx.periodStart.toISOString(),
      periodEnd: ctx.periodEnd.toISOString(),
      keyMetrics: ctx.keyMetrics as Record<string, number | string>,
      insights: (ctx.insights as string[]) || [],
      actionItems: (ctx.actionItems as unknown as ActionItem[]) || undefined,
      connectedSources: (ctx.connectedSources as unknown as string[]) || undefined,
    }));
  } catch (error) {
    console.warn("[NexFlow] Failed to fetch prior contexts:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Save report context for future trend tracking
// ---------------------------------------------------------------------------

export async function saveReportContext(
  reportId: string,
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  integrationData: Record<string, MetricsResult | null>,
  aiNarrative: string | null,
  isFirstReport: boolean,
  actionItems?: ActionItem[],
  connectedSources?: string[],
  signalCounts?: { anomalyCount: number; blockerCount: number; trendCount: number }
) {
  try {
    const keyMetrics = extractKeyMetrics(integrationData);
    // Add health score to persisted context
    const hs = computeHealthScore(integrationData, isFirstReport);
    keyMetrics.healthScore = hs.overall;
    keyMetrics.healthGrade = hs.grade;
    const insights = aiNarrative ? extractInsights(aiNarrative) : [];

    await prisma.reportContext.create({
      data: {
        orgId,
        reportId,
        periodStart,
        periodEnd,
        keyMetrics: keyMetrics as object,
        insights: insights as object,
        actionItems: actionItems ? (actionItems as object) : undefined,
        connectedSources: connectedSources ? (connectedSources as object) : undefined,
        signalSummary: signalCounts ? (signalCounts as object) : undefined,
      },
    });

    console.log(`[NexFlow] Report context saved for report ${reportId}`);
  } catch (error) {
    console.error("[NexFlow] Failed to save report context:", error);
  }
}

// ---------------------------------------------------------------------------
// Background generation — pulls ONLY from real integrations
// ---------------------------------------------------------------------------

export async function generateReportInBackground(reportId: string, orgId: string) {
  try {
    console.log(`[NexFlow] Starting background generation for report ${reportId}`);

    // Fetch integrations and org preferences in parallel
    const [integrations, org] = await Promise.all([
      prisma.integration.findMany({
        where: { orgId, status: "CONNECTED" },
      }),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { reportPreferences: true },
      }),
    ]);

    const prefs = (org?.reportPreferences as Record<string, unknown>) || {};

    if (integrations.length === 0) {
      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: "DRAFT",
          summary: "No integrations connected. Client needs to connect at least one service.",
        },
      });
      return;
    }

    const integrationData: Record<string, MetricsResult | null> = {};
    const connectedSources: string[] = [];
    const metricsPromises: Promise<void>[] = [];
    // 90-day lookback for deep trend analysis
    const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const sinceIso = sinceDate.toISOString();

    for (const integration of integrations) {
      let accessToken = "";
      try {
        accessToken = integration.accessToken ? decryptToken(integration.accessToken) : "";
      } catch {
        // Fallback for tokens stored before encryption was added
        accessToken = integration.accessToken || "";
      }
      connectedSources.push(integration.type);

      switch (integration.type) {
        case "SLACK":
          metricsPromises.push(
            tryCollectSlackMetrics(accessToken, sinceDate).then((data) => { integrationData.slack = data; })
          );
          break;
        case "GITHUB": {
          const ghConfig = (integration.config as Record<string, unknown>) || {};
          const selectedRepos = (ghConfig.selectedRepos as string[]) || undefined;
          metricsPromises.push(
            tryCollectGithubMetrics(accessToken, sinceIso, selectedRepos).then((data) => { integrationData.github = data; })
          );
          break;
        }
        case "JIRA":
          metricsPromises.push(
            tryCollectJiraMetrics(accessToken, sinceIso).then((data) => { integrationData.jira = data; })
          );
          break;
        case "LINEAR":
          metricsPromises.push(
            tryCollectLinearMetrics(accessToken, sinceIso).then((data) => { integrationData.linear = data; })
          );
          break;
        case "GOOGLE_CALENDAR":
          metricsPromises.push(
            tryCollectGoogleCalendarMetrics(accessToken, sinceIso).then((data) => { integrationData.googleCalendar = data; })
          );
          break;
      }
    }

    // Fetch prior contexts in parallel with metrics (3 for trends, all for progression)
    const [, priorContexts, allPriorContexts] = await Promise.all([
      Promise.allSettled(metricsPromises),
      fetchPriorContexts(orgId, 3),
      fetchPriorContexts(orgId, 50),
    ]);

    const now = new Date();
    const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // ── Signal Analysis ──────────────────────────────────
    console.log(`[NexFlow] Running signal analysis for report ${reportId}`);

    // 1. Extract current key metrics for trend comparison
    const currentKeyMetrics = extractKeyMetrics(integrationData);

    // 2. Anomaly detection (contributor outliers + team-level trends)
    const anomalies = detectAnomalies(integrationData, currentKeyMetrics, priorContexts);
    console.log(`[NexFlow] Anomalies: ${anomalies.contributorAnomalies.length} contributor, ${anomalies.teamTrends.length} team-level`);

    // 3. Slack blocker detection
    const blockers = integrationData.slack?._rawMessages
      ? detectSlackBlockers(integrationData.slack._rawMessages, integrationData.jira || null)
      : { blockers: [], totalMessagesScanned: 0, channelsScanned: 0 };
    console.log(`[NexFlow] Blockers: ${blockers.blockers.length} signals from ${blockers.channelsScanned} channels`);

    // 4. Trend comparison (current vs prior periods)
    const trends = computeTrends(currentKeyMetrics, priorContexts);
    console.log(`[NexFlow] Trends: ${trends.trends.length} metrics compared`);

    // 5. Code churn analysis (GitHub)
    const codeChurn = integrationData.github ? analyzeCodeChurn(integrationData.github) : null;
    if (codeChurn) console.log(`[NexFlow] Code churn: net +${codeChurn.netLinesAdded} LOC, ${codeChurn.largePrCount} large PRs`);

    // 6. Sprint velocity forecast + carry-over (Jira)
    const sprintForecast = integrationData.jira
      ? computeSprintVelocityForecast(integrationData.jira, priorContexts)
      : null;
    const sprintCarryOver = integrationData.jira
      ? detectSprintCarryOver(integrationData.jira, priorContexts)
      : null;
    if (sprintForecast) console.log(`[NexFlow] Sprint forecast: ${sprintForecast.predictedCompletionRate}% predicted (${sprintForecast.confidence} confidence)`);
    if (sprintCarryOver) console.log(`[NexFlow] Sprint carry-over: ${sprintCarryOver.carryOverCount} issues`);

    // 7. Cross-source correlations
    const crossSource = analyzeCrossSources(integrationData, connectedSources);
    console.log(`[NexFlow] Cross-source insights: ${crossSource.insights.length}`);

    // 8. Progression tracking + benchmarks
    const progression = computeProgression(currentKeyMetrics, allPriorContexts);
    const benchmarks = computeBenchmarks(currentKeyMetrics, connectedSources);
    if (progression) console.log(`[NexFlow] Progression: ${progression.reportCount} reports tracked, $${progression.estimatedCostSavings} estimated savings`);
    console.log(`[NexFlow] Benchmarks: ${benchmarks.comparisons.length} metrics compared, ${benchmarks.overallPerformance}`);

    // Strip raw Slack messages before persisting (keep payload manageable)
    if (integrationData.slack?._rawMessages) {
      delete integrationData.slack._rawMessages;
    }
    // Strip prDetails from GitHub before persisting (large payload)
    if (integrationData.github?.pullRequests?.prDetails) {
      delete integrationData.github.pullRequests.prDetails;
    }

    // Build a summary from actual data
    const dataSources = connectedSources.filter((s) => integrationData[s.toLowerCase()] != null || integrationData[s === "GOOGLE_CALENDAR" ? "googleCalendar" : s.toLowerCase()] != null);

    const title = `Weekly Engineering Digest, ${periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const summary = `Data pulled from ${dataSources.length} live source(s): ${connectedSources.join(", ")}`;

    // Build custom instruction from org preferences
    const customContext = (prefs.customContext as string) || "";
    const customInstruction = customContext.trim()
      ? `Additional client context: ${customContext.trim()}`
      : undefined;

    // ── AI Narrative Generation (with signals) ──────────
    const signals = { anomalies, blockers, trends };

    let aiNarrative: string | null = null;
    try {
      aiNarrative = await generateNarrative(
        "weekly_digest",
        {
          integrationData,
          connectedSources,
          periodStart: periodStart.toISOString(),
          periodEnd: now.toISOString(),
        },
        customInstruction,
        priorContexts,
        signals,
        connectedSources
      );
    } catch (error) {
      console.error("[NexFlow] AI narrative failed:", error);
      aiNarrative = "AI narrative generation failed. Raw integration data is available in the report content.";
    }

    // ── Action Items (second Claude pass) ──────────────
    let actionItems: ActionItem[] = [];
    try {
      actionItems = await generateActionItems(
        aiNarrative || "",
        integrationData,
        signals
      );
      console.log(`[NexFlow] Action items: ${actionItems.length} generated`);
    } catch (error) {
      console.warn("[NexFlow] Action items generation failed:", error);
    }

    // ── Persist Report ────────────────────────────────
    // Include prior context summary for the HTML renderer's comparison card
    const priorContextSummary = priorContexts.length > 0
      ? {
          periodEnd: priorContexts[0].periodEnd,
          keyMetrics: priorContexts[0].keyMetrics,
          actionItems: priorContexts[0].actionItems || [],
        }
      : null;

    const reportData = {
      integrationData,
      connectedSources,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      anomalies,
      blockers,
      trends,
      actionItems,
      priorReport: priorContextSummary,
      reportNumber: allPriorContexts.length + 1,
      // Phase 2-4 signals
      codeChurn,
      sprintForecast,
      sprintCarryOver,
      crossSource,
      progression,
      benchmarks,
    };

    await prisma.report.update({
      where: { id: reportId },
      data: {
        title,
        summary,
        content: reportData as object,
        aiNarrative,
        status: "PENDING_REVIEW",
        periodStart,
        periodEnd: now,
        generatedAt: new Date(),
      },
    });

    // Save context for future reports — check if first report
    const priorDeliveryCount = await prisma.reportDelivery.count({
      where: { report: { orgId }, status: "SENT" },
    });

    // Include signal summary in context for future baselines
    currentKeyMetrics.anomalyCount = anomalies.contributorAnomalies.length;
    currentKeyMetrics.blockerCount = blockers.blockers.length;

    const signalCounts = {
      anomalyCount: anomalies.contributorAnomalies.length,
      blockerCount: blockers.blockers.length,
      trendCount: trends.trends.length,
    };

    await saveReportContext(
      reportId, orgId, periodStart, now, integrationData, aiNarrative,
      priorDeliveryCount === 0,
      actionItems,
      connectedSources,
      signalCounts
    );

    console.log(`[NexFlow] Report ${reportId} generated successfully with signals`);

    // B4: Notify admins that a new report is ready for review
    try {
      const topDiscoveries: string[] = [];
      if (blockers.blockers.length > 0) topDiscoveries.push(`${blockers.blockers.length} blocker signals detected in Slack`);
      if (integrationData.jira?.issues?.overdue?.length) topDiscoveries.push(`${integrationData.jira.issues.overdue.length} overdue Jira tickets`);
      if (integrationData.github?.pullRequests?.stalePrs?.length) topDiscoveries.push(`${integrationData.github.pullRequests.stalePrs.length} stale PRs need attention`);

      const hs = computeHealthScore(integrationData, priorDeliveryCount === 0);
      await notifyAdminsReportReady({
        reportId,
        orgId,
        reportTitle: title,
        healthScore: { overall: hs.overall, grade: hs.grade },
        topDiscoveries,
      });
    } catch (notifyError) {
      console.warn("[NexFlow] Admin notification failed (non-fatal):", notifyError);
    }
  } catch (error) {
    console.error(`[NexFlow] Background generation failed for ${reportId}:`, error);
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: "DRAFT",
        summary: `Generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    }).catch(() => {});
  }
}
