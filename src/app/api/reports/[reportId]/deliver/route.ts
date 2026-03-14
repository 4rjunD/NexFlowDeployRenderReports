import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { sendReportEmail } from "@/lib/email/send";
import { computeKPIs } from "@/lib/pdf/report-html";
import { computeHealthScore } from "@/lib/scoring/health-score";
import { deliverReportToSlack } from "@/lib/delivery/slack";
import { subjectForRole, introForRole } from "@/lib/delivery/role-sections";

const deliverSchema = z.object({
  // Legacy single/multi email (still supported)
  recipientEmail: z.string().email().optional(),
  recipients: z.array(z.string().email()).optional(),
  slackChannel: z.string().optional(),
  // Enterprise: deliver to all configured ReportRecipients for this org
  deliverToAll: z.boolean().optional(),
}).refine(
  (data) => data.deliverToAll || data.recipientEmail || (data.recipients && data.recipients.length > 0) || data.slackChannel,
  { message: "Specify deliverToAll, recipient email(s), or a Slack channel" }
);

export async function POST(
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
        { error: "Only admins can deliver reports" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = deliverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id: params.reportId },
      include: { organization: { select: { name: true, id: true } } },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Report must be approved before delivery" },
        { status: 400 }
      );
    }

    const content = (report.content as Record<string, any>) || {};
    const orgName = report.organization?.name || "Your Organization";
    const orgId = report.organization?.id;
    const integrationData = content.integrationData || {};

    const priorDeliveries = await prisma.reportDelivery.count({
      where: { report: { orgId }, status: "SENT" },
    });
    const isFirstReport = priorDeliveries === 0;
    const healthScore = computeHealthScore(integrationData, isFirstReport);
    const kpis = computeKPIs(integrationData);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

    // Extract top discoveries for email preview
    const topDiscoveries = extractTopDiscoveries(content);

    const results: { recipient: string; channel: string; role?: string; depth?: string; status: string; error?: string }[] = [];

    // ─── Enterprise: Deliver to all configured recipients ───
    if (parsed.data.deliverToAll && orgId) {
      const recipients = await prisma.reportRecipient.findMany({
        where: { orgId, active: true },
        orderBy: { role: "asc" },
      });

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: "No active recipients configured for this organization. Add recipients first." },
          { status: 400 }
        );
      }

      // Process in parallel batches of 20 to avoid overwhelming SMTP
      const BATCH_SIZE = 20;
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (r) => {
          // Email delivery
          if (r.channels.includes("EMAIL")) {
            await deliverEmailToRecipient({
              reportId: report.id,
              reportTitle: report.title,
              email: r.email,
              name: r.name,
              role: r.role,
              depth: r.reportDepth,
              orgName,
              kpis,
              healthScore,
              topDiscoveries,
              baseUrl,
              results,
            });
          }

          // Slack DM delivery
          if (r.channels.includes("SLACK") && r.slackUserId && orgId) {
            await deliverSlackToRecipient({
              reportId: report.id,
              reportTitle: report.title,
              orgId,
              slackTarget: r.slackUserId,
              name: r.name,
              role: r.role,
              depth: r.reportDepth,
              healthScore,
              content,
              baseUrl,
              results,
            });
          }
        });
        await Promise.allSettled(batchPromises);
      }
    }

    // ─── Legacy: ad-hoc email recipients ───
    const emailRecipients: string[] = [];
    if (parsed.data.recipientEmail) emailRecipients.push(parsed.data.recipientEmail);
    if (parsed.data.recipients) emailRecipients.push(...parsed.data.recipients);
    const uniqueEmails = Array.from(new Set(emailRecipients));

    const adHocPromises = uniqueEmails.map(async (email) => {
      await deliverEmailToRecipient({
        reportId: report.id,
        reportTitle: report.title,
        email,
        name: null,
        role: null,
        depth: null,
        orgName,
        kpis,
        healthScore,
        topDiscoveries,
        baseUrl,
        results,
      });
    });

    // ─── Legacy: Slack channel delivery ───
    const slackChannel = parsed.data.slackChannel;
    let slackPromise: Promise<void> | null = null;
    if (slackChannel && orgId) {
      slackPromise = deliverSlackToRecipient({
        reportId: report.id,
        reportTitle: report.title,
        orgId,
        slackTarget: slackChannel,
        name: null,
        role: null,
        depth: null,
        healthScore,
        content,
        baseUrl,
        results,
      });
    }

    await Promise.allSettled([...adHocPromises, ...(slackPromise ? [slackPromise] : [])]);

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    if (sentCount > 0) {
      await prisma.report.update({
        where: { id: report.id },
        data: { status: "DELIVERED" },
      });
    }

    return NextResponse.json({
      success: sentCount > 0,
      message: `${sentCount} delivered, ${failedCount} failed`,
      totalRecipients: results.length,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error("[NexFlow] Report delivery failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────

interface EmailDeliveryOpts {
  reportId: string;
  reportTitle: string;
  email: string;
  name: string | null;
  role: string | null;
  depth: string | null;
  orgName: string;
  kpis: { label: string; value: string; detail: string }[];
  healthScore: any;
  topDiscoveries: string[];
  baseUrl: string;
  results: { recipient: string; channel: string; role?: string; depth?: string; status: string; error?: string }[];
}

async function deliverEmailToRecipient(opts: EmailDeliveryOpts) {
  const { reportId, reportTitle, email, name, role, depth, orgName, kpis, healthScore, topDiscoveries, baseUrl, results } = opts;

  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId,
      channel: "EMAIL",
      recipientEmail: email,
      recipientName: name,
      recipientRole: role,
      reportDepth: depth,
      status: "PENDING",
    },
  });

  const reportViewUrl = `${baseUrl}/api/reports/${reportId}/view?token=${delivery.id}`;
  const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;

  // Role-aware subject line
  const subject = role ? subjectForRole(role, reportTitle) : `${reportTitle} — NexFlow Report`;

  try {
    await sendReportEmail({
      to: email,
      subject,
      reportTitle,
      orgName,
      kpis,
      reportViewUrl,
      pdfDownloadUrl,
      healthScore,
      topDiscoveries: topDiscoveries.slice(0, 3),
      recipientName: name || undefined,
      recipientRole: role || undefined,
      reportDepth: depth || undefined,
    });

    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    results.push({ recipient: email, channel: "EMAIL", role: role || undefined, depth: depth || undefined, status: "sent" });
  } catch (emailError) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: emailError instanceof Error ? emailError.message : "Unknown" },
    });
    results.push({
      recipient: email,
      channel: "EMAIL",
      role: role || undefined,
      status: "failed",
      error: emailError instanceof Error ? emailError.message : "Unknown",
    });
  }
}

interface SlackDeliveryOpts {
  reportId: string;
  reportTitle: string;
  orgId: string;
  slackTarget: string; // channel name/ID or user ID for DM
  name: string | null;
  role: string | null;
  depth: string | null;
  healthScore: any;
  content: Record<string, any>;
  baseUrl: string;
  results: { recipient: string; channel: string; role?: string; depth?: string; status: string; error?: string }[];
}

async function deliverSlackToRecipient(opts: SlackDeliveryOpts) {
  const { reportId, reportTitle, orgId, slackTarget, name, role, depth, healthScore, content, baseUrl, results } = opts;

  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId,
      channel: "SLACK",
      recipientEmail: slackTarget,
      recipientName: name,
      recipientRole: role,
      reportDepth: depth,
      status: "PENDING",
    },
  });

  try {
    const discoveries = extractSlackDiscoveries(content);
    const actionItems = (content.actionItems || []) as { priority: string; title: string }[];
    const reportViewUrl = `${baseUrl}/api/reports/${reportId}/view?token=${delivery.id}`;

    const slackResult = await deliverReportToSlack({
      orgId,
      reportId,
      channel: slackTarget,
      healthScore,
      discoveries,
      actionItems,
      reportTitle,
      reportUrl: reportViewUrl,
    });

    if (slackResult.ok) {
      await prisma.reportDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      results.push({ recipient: slackTarget, channel: "SLACK", role: role || undefined, status: "sent" });
    } else {
      throw new Error(slackResult.error || "Slack delivery failed");
    }
  } catch (slackError) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: slackError instanceof Error ? slackError.message : "Unknown" },
    });
    results.push({
      recipient: slackTarget,
      channel: "SLACK",
      role: role || undefined,
      status: "failed",
      error: slackError instanceof Error ? slackError.message : "Unknown",
    });
  }
}

function extractTopDiscoveries(content: Record<string, any>): string[] {
  const discoveries: string[] = [];
  const integrationData = content.integrationData || {};
  if (content.blockers?.blockers?.length) {
    discoveries.push(`${content.blockers.blockers.length} blocker signals detected in Slack`);
  }
  const jira = integrationData.jira as Record<string, any> | undefined;
  if (jira?.issues?.overdue?.length) {
    discoveries.push(`${jira.issues.overdue.length} overdue tickets need attention`);
  }
  const gh = integrationData.github as Record<string, any> | undefined;
  if (gh?.pullRequests?.stalePrs?.length) {
    discoveries.push(`${gh.pullRequests.stalePrs.length} PRs stale for 7+ days`);
  }
  if (gh?.pullRequests?.merged) {
    discoveries.push(`${gh.pullRequests.merged} PRs merged this period`);
  }
  return discoveries;
}

function extractSlackDiscoveries(content: Record<string, any>): { headline: string; color: string }[] {
  const discoveries: { headline: string; color: string }[] = [];
  const integrationData = content.integrationData || {};
  if (content.blockers?.blockers?.length) {
    discoveries.push({ headline: `${content.blockers.blockers.length} blocker signals detected`, color: "red" });
  }
  const jira = integrationData.jira as Record<string, any> | undefined;
  if (jira?.issues?.overdue?.length) {
    discoveries.push({ headline: `${jira.issues.overdue.length} overdue tickets`, color: "red" });
  }
  const gh = integrationData.github as Record<string, any> | undefined;
  if (gh?.pullRequests?.stalePrs?.length) {
    discoveries.push({ headline: `${gh.pullRequests.stalePrs.length} stale PRs`, color: "amber" });
  }
  return discoveries.slice(0, 3);
}
