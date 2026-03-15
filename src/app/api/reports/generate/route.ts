// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Report Generation API Route (Async, Real Data Only)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { generateReportInBackground } from "@/lib/reports/generate-background";

const generateReportSchema = z.object({
  type: z.enum(["WEEKLY_DIGEST", "SPRINT_RISK", "MONTHLY_HEALTH"]),
  teamId: z.string().optional(),
  sprintId: z.string().optional(),
  orgId: z.string().optional(),
});

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
    // First report gets 14-day lookback for richer data; subsequent reports use 7 days
    const priorReportCount = await prisma.report.count({ where: { orgId } });
    const lookbackDays = priorReportCount === 0 ? 14 : 7;
    const periodStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

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
