import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { generateNarrative } from "@/lib/ai/claude";

const editSchema = z.object({
  aiNarrative: z.string().optional(),
  summary: z.string().optional(),
  regenerateNarrative: z.boolean().optional(),
  narrativePrompt: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { reportId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can edit reports" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id: params.reportId },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const { aiNarrative, summary, regenerateNarrative, narrativePrompt } =
      parsed.data;

    let newNarrative = aiNarrative;

    // If requested, regenerate narrative with optional custom prompt
    if (regenerateNarrative) {
      const reportType = report.type.toLowerCase().replace("_", "_") as
        | "weekly_digest"
        | "sprint_risk"
        | "monthly_health";

      const customInstruction = narrativePrompt
        ? `\n\nAdditional instructions from the admin reviewer: ${narrativePrompt}`
        : "";

      // Fetch prior contexts for trend-aware regeneration
      let priorContexts: import("@/lib/ai/claude").PriorContext[] = [];
      try {
        const contexts = await prisma.reportContext.findMany({
          where: { orgId: report.orgId, reportId: { not: report.id } },
          orderBy: { createdAt: "desc" },
          take: 3,
        });
        priorContexts = contexts.map((ctx) => ({
          periodStart: ctx.periodStart.toISOString(),
          periodEnd: ctx.periodEnd.toISOString(),
          keyMetrics: ctx.keyMetrics as Record<string, number | string>,
          insights: (ctx.insights as string[]) || [],
        }));
      } catch { /* no prior context available */ }

      try {
        newNarrative = await generateNarrative(
          reportType,
          report.content,
          customInstruction,
          priorContexts
        );
      } catch (error) {
        console.error("[NexFlow] Narrative regeneration failed:", error);
        return NextResponse.json(
          { error: "Failed to regenerate narrative. Try editing manually." },
          { status: 500 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (newNarrative !== undefined) updateData.aiNarrative = newNarrative;
    if (summary !== undefined) updateData.summary = summary;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 }
      );
    }

    const updated = await prisma.report.update({
      where: { id: params.reportId },
      data: updateData,
      include: {
        team: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[NexFlow] Report edit failed:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
