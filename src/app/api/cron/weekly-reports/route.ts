// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Weekly Report Cron Endpoint
// Called by an external cron service (Vercel Cron, Railway, etc.)
// Supports auto-approve and auto-deliver via org deliveryConfig.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { generateReportInBackground } from "@/lib/reports/generate-background";
import { parseDeliveryConfig, isDeliveryTime, autoApproveReport, autoDeliverReport } from "@/lib/delivery/scheduler";

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

type Schedule = "weekly_monday" | "weekly_friday" | "biweekly" | "monthly" | "disabled";

const VALID_SCHEDULES: Schedule[] = ["weekly_monday", "weekly_friday", "biweekly", "monthly", "disabled"];

/**
 * Determine whether a given schedule should fire today.
 *  - weekly_monday  → every Monday
 *  - weekly_friday  → every Friday
 *  - biweekly       → every other Monday (ISO week is even)
 *  - monthly        → first Monday of the month
 *  - disabled       → never
 */
function shouldRunToday(schedule: string | null | undefined): boolean {
  const s = (schedule ?? "weekly_monday") as Schedule;
  if (!VALID_SCHEDULES.includes(s)) return false;
  if (s === "disabled") return false;

  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun … 6=Sat

  switch (s) {
    case "weekly_monday":
      return dayOfWeek === 1;
    case "weekly_friday":
      return dayOfWeek === 5;
    case "biweekly": {
      if (dayOfWeek !== 1) return false;
      // ISO week number — fire on even weeks
      const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const daysSinceJan1 = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
      const weekNumber = Math.ceil((daysSinceJan1 + jan1.getUTCDay() + 1) / 7);
      return weekNumber % 2 === 0;
    }
    case "monthly": {
      // First Monday of the month
      if (dayOfWeek !== 1) return false;
      return now.getUTCDate() <= 7;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// GET — Cron trigger
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // ── Auth: verify CRON_SECRET ──────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[NexFlow Cron] CRON_SECRET env var is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") || querySecret;

  if (providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Find eligible organizations ───────────────────────
  try {
    const orgs = await prisma.organization.findMany({
      where: {
        integrations: {
          some: { status: "CONNECTED" },
        },
      },
      select: {
        id: true,
        name: true,
        reportSchedule: true,
        deliveryConfig: true,
      },
    });

    const results: { orgId: string; orgName: string; status: string; delivery?: string }[] = [];
    let queued = 0;
    let skipped = 0;

    for (const org of orgs) {
      // Check scheduling preference
      if (!shouldRunToday(org.reportSchedule)) {
        results.push({ orgId: org.id, orgName: org.name, status: "skipped_schedule" });
        skipped++;
        continue;
      }

      try {
        // Create the report record
        const now = new Date();
        const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        const report = await prisma.report.create({
          data: {
            type: "WEEKLY_DIGEST",
            title: "Generating report...",
            summary: "Automated weekly report — pulling data from connected integrations.",
            content: {},
            status: "GENERATED",
            periodStart,
            periodEnd: now,
            orgId: org.id,
          },
        });

        // Kick off background generation
        // After generation, check for auto-approve/auto-deliver
        const deliveryConfig = parseDeliveryConfig(org.deliveryConfig);

        generateReportInBackground(report.id, org.id)
          .then(async () => {
            // B2: Auto-approve if configured
            if (deliveryConfig?.autoApprove) {
              const approved = await autoApproveReport(report.id);
              if (!approved) return;

              // B2: Auto-deliver if configured and it's the right time
              if (deliveryConfig.autoDeliver) {
                const deliveryResult = await autoDeliverReport(report.id, deliveryConfig);
                console.log(`[NexFlow Cron] Auto-delivery for org ${org.id}: ${deliveryResult.emailsSent} emails, ${deliveryResult.slacksSent} Slack, ${deliveryResult.errors.length} errors`);
              }
            }
          })
          .catch((err) => {
            console.error(`[NexFlow Cron] Background generation failed for org ${org.id}:`, err);
          });

        const deliveryStatus = deliveryConfig?.autoApprove
          ? `auto-approve${deliveryConfig.autoDeliver ? "+auto-deliver" : ""}`
          : "manual-review";

        results.push({ orgId: org.id, orgName: org.name, status: "queued", delivery: deliveryStatus });
        queued++;
      } catch (error) {
        console.error(`[NexFlow Cron] Failed to create report for org ${org.id}:`, error);
        results.push({
          orgId: org.id,
          orgName: org.name,
          status: `error: ${error instanceof Error ? error.message : "Unknown"}`,
        });
      }
    }

    console.log(`[NexFlow Cron] Finished: ${queued} queued, ${skipped} skipped, ${orgs.length} total orgs`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalOrgs: orgs.length,
      queued,
      skipped,
      results,
    });
  } catch (error) {
    console.error("[NexFlow Cron] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
