// ─────────────────────────────────────────────────────────────
// NexFlow — Scheduled Delivery Logic
// Handles auto-approve and auto-deliver based on org delivery config.
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";
import { sendReportEmail } from "@/lib/email/send";
import { deliverReportToSlack } from "@/lib/delivery/slack";
import { buildReportHtml, computeKPIs } from "@/lib/pdf/report-html";
import { htmlToPdf } from "@/lib/pdf/generate";
import { computeHealthScore } from "@/lib/scoring/health-score";

export interface DeliveryConfig {
  autoApprove: boolean;
  autoDeliver: boolean;
  deliveryDay: string; // "monday" | "tuesday" | etc.
  deliveryTime: string; // "09:00"
  timezone: string; // "America/New_York"
  channels: ("EMAIL" | "SLACK")[];
  recipients: {
    email?: string;
    slackChannel?: string;
  }[];
}

export function parseDeliveryConfig(json: unknown): DeliveryConfig | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  return {
    autoApprove: !!obj.autoApprove,
    autoDeliver: !!obj.autoDeliver,
    deliveryDay: (obj.deliveryDay as string) || "monday",
    deliveryTime: (obj.deliveryTime as string) || "09:00",
    timezone: (obj.timezone as string) || "America/New_York",
    channels: (obj.channels as ("EMAIL" | "SLACK")[]) || ["EMAIL"],
    recipients: (obj.recipients as DeliveryConfig["recipients"]) || [],
  };
}

export function isDeliveryTime(config: DeliveryConfig): boolean {
  const now = new Date();
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const targetDay = dayMap[config.deliveryDay.toLowerCase()];
  if (targetDay == null || now.getUTCDay() !== targetDay) return false;

  const [targetHour, targetMin] = config.deliveryTime.split(":").map(Number);
  const currentHour = now.getUTCHours();
  // Allow a 1-hour window for cron timing
  return Math.abs(currentHour - targetHour) <= 1;
}

export async function autoApproveReport(reportId: string): Promise<boolean> {
  try {
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewNotes: "Auto-approved by delivery schedule",
      },
    });
    console.log(`[NexFlow Scheduler] Auto-approved report ${reportId}`);
    return true;
  } catch (error) {
    console.error(`[NexFlow Scheduler] Failed to auto-approve ${reportId}:`, error);
    return false;
  }
}

export async function autoDeliverReport(
  reportId: string,
  config: DeliveryConfig
): Promise<{ emailsSent: number; slacksSent: number; errors: string[] }> {
  const result = { emailsSent: 0, slacksSent: 0, errors: [] as string[] };

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { organization: { select: { name: true, id: true } } },
  });

  if (!report || report.status !== "APPROVED") {
    result.errors.push(`Report ${reportId} not found or not approved`);
    return result;
  }

  const content = (report.content as Record<string, unknown>) || {};
  const orgName = report.organization?.name || "Your Organization";
  const integrationData = (content.integrationData as Record<string, unknown>) || {};

  // Check if first report
  const priorDeliveries = await prisma.reportDelivery.count({
    where: { report: { orgId: report.organization?.id }, status: "SENT" },
  });
  const isFirstReport = priorDeliveries === 0;
  const healthScore = computeHealthScore(integrationData, isFirstReport);

  // Generate PDF for email delivery
  let pdfBuffer: Buffer | null = null;
  if (config.channels.includes("EMAIL")) {
    const reportHtml = buildReportHtml({
      title: report.title,
      orgName,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      generatedAt: report.generatedAt,
      aiNarrative: report.aiNarrative,
      content: content as Record<string, unknown>,
      showDownloadBar: false,
      healthScore,
    });
    try {
      pdfBuffer = await htmlToPdf(reportHtml);
    } catch (err) {
      result.errors.push(`PDF generation failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  const kpis = computeKPIs(integrationData);

  // Deliver to each recipient
  const deliveryPromises: Promise<void>[] = [];

  for (const recipient of config.recipients) {
    // Email delivery
    if (recipient.email && config.channels.includes("EMAIL") && pdfBuffer) {
      deliveryPromises.push(
        (async () => {
          const delivery = await prisma.reportDelivery.create({
            data: { reportId, channel: "EMAIL", recipientEmail: recipient.email, status: "PENDING" },
          });
          try {
            await sendReportEmail({
              to: recipient.email!,
              subject: `${report.title} — NexFlow Report`,
              reportTitle: report.title,
              orgName,
              kpis,
              pdfBuffer: pdfBuffer!,
              healthScore,
            });
            await prisma.reportDelivery.update({
              where: { id: delivery.id },
              data: { status: "SENT", sentAt: new Date() },
            });
            result.emailsSent++;
          } catch (err) {
            await prisma.reportDelivery.update({
              where: { id: delivery.id },
              data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown" },
            });
            result.errors.push(`Email to ${recipient.email} failed: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        })()
      );
    }

    // Slack delivery
    if (recipient.slackChannel && config.channels.includes("SLACK") && report.organization?.id) {
      deliveryPromises.push(
        (async () => {
          const delivery = await prisma.reportDelivery.create({
            data: { reportId, channel: "SLACK", recipientEmail: recipient.slackChannel, status: "PENDING" },
          });
          try {
            // Extract top discoveries for Slack summary
            const discoveries = extractTopDiscoveries(content as Record<string, unknown>);
            const actionItems = ((content as Record<string, unknown>).actionItems as { priority: string; title: string }[]) || [];

            const slackResult = await deliverReportToSlack({
              orgId: report.organization!.id,
              reportId,
              channel: recipient.slackChannel!,
              healthScore,
              discoveries,
              actionItems,
              reportTitle: report.title,
            });

            if (slackResult.ok) {
              await prisma.reportDelivery.update({
                where: { id: delivery.id },
                data: { status: "SENT", sentAt: new Date() },
              });
              result.slacksSent++;
            } else {
              throw new Error(slackResult.error || "Slack delivery failed");
            }
          } catch (err) {
            await prisma.reportDelivery.update({
              where: { id: delivery.id },
              data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown" },
            });
            result.errors.push(`Slack to ${recipient.slackChannel} failed: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        })()
      );
    }
  }

  await Promise.allSettled(deliveryPromises);

  // Update report status if any deliveries succeeded
  if (result.emailsSent > 0 || result.slacksSent > 0) {
    await prisma.report.update({
      where: { id: reportId },
      data: { status: "DELIVERED" },
    });
  }

  return result;
}

// Extract top discoveries for Slack summary (simplified)
function extractTopDiscoveries(content: Record<string, unknown>): { headline: string; color: string }[] {
  const discoveries: { headline: string; color: string }[] = [];

  // Blockers
  const blockers = content.blockers as { blockers: unknown[] } | undefined;
  if (blockers?.blockers?.length) {
    discoveries.push({ headline: `${blockers.blockers.length} blocker signals detected in Slack`, color: "red" });
  }

  // Overdue tickets
  const jira = (content.integrationData as Record<string, unknown> | undefined)?.jira as Record<string, unknown> | undefined;
  const issues = jira?.issues as { overdue?: unknown[] } | undefined;
  if (issues?.overdue?.length) {
    discoveries.push({ headline: `${issues.overdue.length} overdue tickets need attention`, color: "red" });
  }

  // Stale PRs
  const github = (content.integrationData as Record<string, unknown> | undefined)?.github as Record<string, unknown> | undefined;
  const prs = github?.pullRequests as { stalePrs?: unknown[] } | undefined;
  if (prs?.stalePrs?.length) {
    discoveries.push({ headline: `${prs.stalePrs.length} PRs stale for 7+ days`, color: "amber" });
  }

  return discoveries.slice(0, 3);
}
