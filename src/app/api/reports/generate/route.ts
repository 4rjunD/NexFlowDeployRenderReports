// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Report Generation API Route (Async, Real Data Only)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import {
  generateNarrative,
  extractKeyMetrics,
  extractInsights,
  type PriorContext,
} from "@/lib/ai/claude";
import { computeHealthScore } from "@/lib/scoring/health-score";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetricsResult = any;

async function tryCollectSlackMetrics(accessToken: string, since: Date): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/slack/metrics");
    return await mod.collectSlackMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Slack metrics:", (error as Error).message);
    return null;
  }
}

async function tryCollectGithubMetrics(accessToken: string, since: string, selectedRepos?: string[]): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/github/metrics");
    return await mod.collectGithubMetrics(accessToken, since, selectedRepos);
  } catch (error) {
    console.warn("[NexFlow] GitHub metrics:", (error as Error).message);
    return null;
  }
}

async function tryCollectLinearMetrics(accessToken: string, since: string): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/linear/metrics");
    return await mod.collectLinearMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Linear metrics:", (error as Error).message);
    return null;
  }
}

async function tryCollectJiraMetrics(accessToken: string, since: string): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/jira/metrics");
    return await mod.collectJiraMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Jira metrics:", (error as Error).message);
    return null;
  }
}

async function tryCollectGoogleCalendarMetrics(accessToken: string, since: string): Promise<MetricsResult | null> {
  try {
    const mod = await import("@/lib/integrations/google/metrics");
    return await mod.collectGoogleCalendarMetrics(accessToken, since);
  } catch (error) {
    console.warn("[NexFlow] Google Calendar metrics:", (error as Error).message);
    return null;
  }
}

const generateReportSchema = z.object({
  type: z.enum(["WEEKLY_DIGEST", "SPRINT_RISK", "MONTHLY_HEALTH"]),
  teamId: z.string().optional(),
  sprintId: z.string().optional(),
  orgId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Fetch prior report contexts for trend comparison
// ---------------------------------------------------------------------------

async function fetchPriorContexts(orgId: string, limit = 3): Promise<PriorContext[]> {
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
    }));
  } catch (error) {
    console.warn("[NexFlow] Failed to fetch prior contexts:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Save report context for future trend tracking
// ---------------------------------------------------------------------------

async function saveReportContext(
  reportId: string,
  orgId: string,
  periodStart: Date,
  periodEnd: Date,
  integrationData: Record<string, MetricsResult | null>,
  aiNarrative: string | null,
  isFirstReport: boolean
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

async function generateReportInBackground(reportId: string, orgId: string) {
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
      const accessToken = integration.accessToken || "";
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

    // Fetch prior contexts in parallel with metrics
    const [, priorContexts] = await Promise.all([
      Promise.allSettled(metricsPromises),
      fetchPriorContexts(orgId),
    ]);

    const now = new Date();
    const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Build a summary from actual data
    const dataSources = connectedSources.filter((s) => integrationData[s.toLowerCase()] != null || integrationData[s === "GOOGLE_CALENDAR" ? "googleCalendar" : s.toLowerCase()] != null);

    const reportData = {
      integrationData,
      connectedSources,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
    };

    const title = `Weekly Engineering Digest — ${periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const summary = `Data pulled from ${dataSources.length} live source(s): ${connectedSources.join(", ")}`;

    // Build custom instruction from org preferences
    const customContext = (prefs.customContext as string) || "";
    const customInstruction = customContext.trim()
      ? `Additional client context: ${customContext.trim()}`
      : undefined;

    // Generate AI narrative from real data + prior context
    let aiNarrative: string | null = null;
    try {
      aiNarrative = await generateNarrative(
        "weekly_digest",
        {
          reportData,
          connectedSources,
          integrationData,
        },
        customInstruction,
        priorContexts
      );
    } catch (error) {
      console.error("[NexFlow] AI narrative failed:", error);
      aiNarrative = "AI narrative generation failed. Raw integration data is available in the report content.";
    }

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
    await saveReportContext(reportId, orgId, periodStart, now, integrationData, aiNarrative, priorDeliveryCount === 0);

    console.log(`[NexFlow] Report ${reportId} generated successfully`);
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

// ---------------------------------------------------------------------------
// POST — creates report instantly, generates in background
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const session = await auth();
    const body = await request.json();
    const parsed = generateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type, teamId } = parsed.data;

    let orgId: string | undefined;
    if (session?.user) {
      orgId = (session.user as any)?.orgId as string | undefined;
    }
    if (parsed.data.orgId) {
      orgId = parsed.data.orgId;
    }
    if (!orgId) {
      return NextResponse.json({ error: "Organization not found." }, { status: 403 });
    }

    // Create report record immediately
    const now = new Date();
    const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const report = await prisma.report.create({
      data: {
        type,
        title: "Generating report...",
        summary: "Pulling data from connected integrations. This usually takes 15-30 seconds.",
        content: {},
        status: "GENERATED",
        periodStart,
        periodEnd: now,
        orgId,
        teamId: teamId || null,
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    // Generate in background
    generateReportInBackground(report.id, orgId).catch((err) => {
      console.error("[NexFlow] Unhandled background error:", err);
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("[NexFlow] Report creation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
