// ─────────────────────────────────────────────────────────────
// NexFlow — Scheduled Delivery Logic
// Handles auto-approve and auto-deliver based on org delivery config.
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";
import { sendReportEmail } from "@/lib/email/send";
import { deliverReportToSlack } from "@/lib/delivery/slack";
import { computeKPIs } from "@/lib/pdf/report-html";
import { computeHealthScore } from "@/lib/scoring/health-score";

export interface DeliveryConfig {
  autoApprove: boolean;
  autoDeliver: boolean;
  deliveryDay: string;
  deliveryTime: string;
  timezone: string;
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

  const [targetHour] = config.deliveryTime.split(":").map(Number);
  const currentHour = now.getUTCHours();
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

  const priorDeliveries = await prisma.reportDelivery.count({
    where: { report: { orgId: report.organization?.id }, status: "SENT" },
  });
  const isFirstReport = priorDeliveries === 0;
  const healthScore = computeHealthScore(integrationData, isFirstReport);
  const kpis = computeKPIs(integrationData);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

  // Extract top discoveries
  const topDiscoveries: string[] = [];
  const blockers = content.blockers as { blockers: unknown[] } | undefined;
  if (blockers?.blockers?.length) topDiscoveries.push(`${blockers.blockers.length} blocker signals detected`);
  const jira = (integrationData.jira as Record<string, any> | undefined);
  if (jira?.issues?.overdue?.length) topDiscoveries.push(`${jira.issues.overdue.length} overdue tickets`);

  // ── Use ReportRecipient model first, fall back to legacy config.recipients ──
  const orgRecipients = report.organization?.id
    ? await prisma.reportRecipient.findMany({
        where: { orgId: report.organization.id, active: true },
      })
    : [];

  const deliveryPromises: Promise<void>[] = [];

  if (orgRecipients.length > 0) {
    // Enterprise path: use ReportRecipient with role-aware delivery
    const { subjectForRole } = await import("@/lib/delivery/role-sections");

    const BATCH_SIZE = 20;
    for (let i = 0; i < orgRecipients.length; i += BATCH_SIZE) {
      const batch = orgRecipients.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (r) => {
        // Email delivery
        if (r.channels.includes("EMAIL")) {
          const delivery = await prisma.reportDelivery.create({
            data: {
              reportId, channel: "EMAIL", recipientEmail: r.email,
              recipientName: r.name, recipientRole: r.role, reportDepth: r.reportDepth,
              status: "PENDING",
            },
          });
          const reportViewUrl = `${baseUrl}/api/reports/${reportId}/view?token=${delivery.id}`;
          const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;
          const subject = subjectForRole(r.role, report.title);
          try {
            await sendReportEmail({
              to: r.email,
              subject,
              reportTitle: report.title,
              orgName,
              kpis,
              reportViewUrl,
              pdfDownloadUrl,
              healthScore,
              topDiscoveries: topDiscoveries.slice(0, 3),
              recipientName: r.name,
              recipientRole: r.role,
              reportDepth: r.reportDepth,
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
            result.errors.push(`Email to ${r.email} failed: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }

        // Slack DM delivery
        if (r.channels.includes("SLACK") && r.slackUserId && report.organization?.id) {
          const delivery = await prisma.reportDelivery.create({
            data: {
              reportId, channel: "SLACK", recipientEmail: r.slackUserId,
              recipientName: r.name, recipientRole: r.role, reportDepth: r.reportDepth,
              status: "PENDING",
            },
          });
          try {
            const discoveries = extractTopDiscoveries(content as Record<string, unknown>);
            const actionItems = ((content as Record<string, unknown>).actionItems as { priority: string; title: string }[]) || [];
            const reportViewUrl = `${baseUrl}/api/reports/${reportId}/view?token=${delivery.id}`;
            const slackResult = await deliverReportToSlack({
              orgId: report.organization!.id,
              reportId,
              channel: r.slackUserId,
              healthScore,
              discoveries,
              actionItems,
              reportTitle: report.title,
              reportUrl: reportViewUrl,
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
            result.errors.push(`Slack to ${r.slackUserId} failed: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }
      });
      await Promise.allSettled(batchPromises);
    }
  } else {
    // Legacy path: use config.recipients
    for (const recipient of config.recipients) {
      if (recipient.email && config.channels.includes("EMAIL")) {
        deliveryPromises.push(
          (async () => {
            const delivery = await prisma.reportDelivery.create({
              data: { reportId, channel: "EMAIL", recipientEmail: recipient.email, status: "PENDING" },
            });
            const reportViewUrl = `${baseUrl}/api/reports/${reportId}/view?token=${delivery.id}`;
            const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;
            try {
              await sendReportEmail({
                to: recipient.email!,
                subject: `${report.title} — NexFlow Report`,
                reportTitle: report.title,
                orgName,
                kpis,
                reportViewUrl,
                pdfDownloadUrl,
                healthScore,
                topDiscoveries: topDiscoveries.slice(0, 3),
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

      if (recipient.slackChannel && config.channels.includes("SLACK") && report.organization?.id) {
        deliveryPromises.push(
          (async () => {
            const delivery = await prisma.reportDelivery.create({
              data: { reportId, channel: "SLACK", recipientEmail: recipient.slackChannel, status: "PENDING" },
            });
            try {
              const discoveries = extractTopDiscoveries(content as Record<string, unknown>);
              const actionItems = ((content as Record<string, unknown>).actionItems as { priority: string; title: string }[]) || [];
              const reportViewUrl = `${baseUrl}/api/reports/${reportId}/view?token=${delivery.id}`;
              const slackResult = await deliverReportToSlack({
                orgId: report.organization!.id,
                reportId,
                channel: recipient.slackChannel!,
                healthScore,
                discoveries,
                actionItems,
                reportTitle: report.title,
                reportUrl: reportViewUrl,
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
  }

  if (result.emailsSent > 0 || result.slacksSent > 0) {
    await prisma.report.update({
      where: { id: reportId },
      data: { status: "DELIVERED" },
    });
  }

  return result;
}

function extractTopDiscoveries(content: Record<string, unknown>): { headline: string; color: string }[] {
  const discoveries: { headline: string; color: string }[] = [];
  const blockers = content.blockers as { blockers: unknown[] } | undefined;
  if (blockers?.blockers?.length) discoveries.push({ headline: `${blockers.blockers.length} blocker signals detected in Slack`, color: "red" });
  const jira = (content.integrationData as Record<string, unknown> | undefined)?.jira as Record<string, unknown> | undefined;
  const issues = jira?.issues as { overdue?: unknown[] } | undefined;
  if (issues?.overdue?.length) discoveries.push({ headline: `${issues.overdue.length} overdue tickets need attention`, color: "red" });
  const github = (content.integrationData as Record<string, unknown> | undefined)?.github as Record<string, unknown> | undefined;
  const prs = github?.pullRequests as { stalePrs?: unknown[] } | undefined;
  if (prs?.stalePrs?.length) discoveries.push({ headline: `${prs.stalePrs.length} PRs stale for 7+ days`, color: "amber" });
  return discoveries.slice(0, 3);
}
