import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { sendReportEmail } from "@/lib/email/send";
import { computeKPIs } from "@/lib/pdf/report-html";
import { computeHealthScore } from "@/lib/scoring/health-score";
import { deliverReportToSlack } from "@/lib/delivery/slack";

const deliverSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipients: z.array(z.string().email()).optional(),
  slackChannel: z.string().optional(),
}).refine(
  (data) => data.recipientEmail || (data.recipients && data.recipients.length > 0) || data.slackChannel,
  { message: "At least one recipient email or Slack channel is required" }
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

    // Build recipient list
    const emailRecipients: string[] = [];
    if (parsed.data.recipientEmail) emailRecipients.push(parsed.data.recipientEmail);
    if (parsed.data.recipients) emailRecipients.push(...parsed.data.recipients);
    const uniqueEmails = Array.from(new Set(emailRecipients));

    const slackChannel = parsed.data.slackChannel;
    const content = (report.content as Record<string, any>) || {};
    const orgName = report.organization?.name || "Your Organization";
    const integrationData = content.integrationData || {};

    const priorDeliveries = await prisma.reportDelivery.count({
      where: {
        report: { orgId: report.organization?.id },
        status: "SENT",
      },
    });
    const isFirstReport = priorDeliveries === 0;
    const healthScore = computeHealthScore(integrationData, isFirstReport);
    const kpis = computeKPIs(integrationData);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

    // Extract top discoveries for email preview
    const topDiscoveries: string[] = [];
    if (content.blockers?.blockers?.length) {
      topDiscoveries.push(`${content.blockers.blockers.length} blocker signals detected in Slack`);
    }
    const jira = integrationData.jira as Record<string, any> | undefined;
    if (jira?.issues?.overdue?.length) {
      topDiscoveries.push(`${jira.issues.overdue.length} overdue tickets need attention`);
    }
    const gh = integrationData.github as Record<string, any> | undefined;
    if (gh?.pullRequests?.stalePrs?.length) {
      topDiscoveries.push(`${gh.pullRequests.stalePrs.length} PRs stale for 7+ days`);
    }
    if (gh?.pullRequests?.merged) {
      topDiscoveries.push(`${gh.pullRequests.merged} PRs merged this period`);
    }

    const results: { recipient: string; channel: string; status: string; error?: string }[] = [];

    // Send emails — each recipient gets their own delivery record (used as view token)
    const emailPromises = uniqueEmails.map(async (email) => {
      const delivery = await prisma.reportDelivery.create({
        data: {
          reportId: report.id,
          channel: "EMAIL",
          recipientEmail: email,
          status: "PENDING",
        },
      });

      // Build unique view URLs using the delivery ID as token
      const reportViewUrl = `${baseUrl}/api/reports/${report.id}/view?token=${delivery.id}`;
      const pdfDownloadUrl = `${baseUrl}/api/reports/${report.id}/view?token=${delivery.id}&format=pdf`;

      try {
        await sendReportEmail({
          to: email,
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

        results.push({ recipient: email, channel: "EMAIL", status: "sent" });
      } catch (emailError) {
        await prisma.reportDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            error: emailError instanceof Error ? emailError.message : "Unknown email error",
          },
        });
        results.push({
          recipient: email,
          channel: "EMAIL",
          status: "failed",
          error: emailError instanceof Error ? emailError.message : "Unknown error",
        });
      }
    });

    // Slack delivery
    let slackPromise: Promise<void> | null = null;
    if (slackChannel && report.organization?.id) {
      slackPromise = (async () => {
        const delivery = await prisma.reportDelivery.create({
          data: {
            reportId: report.id,
            channel: "SLACK",
            recipientEmail: slackChannel,
            status: "PENDING",
          },
        });

        try {
          const actionItems = (content.actionItems || []) as { priority: string; title: string }[];
          const discoveries: { headline: string; color: string }[] = [];

          if (content.blockers?.blockers?.length) {
            discoveries.push({ headline: `${content.blockers.blockers.length} blocker signals detected`, color: "red" });
          }
          if (jira?.issues?.overdue?.length) {
            discoveries.push({ headline: `${jira.issues.overdue.length} overdue tickets`, color: "red" });
          }
          if (gh?.pullRequests?.stalePrs?.length) {
            discoveries.push({ headline: `${gh.pullRequests.stalePrs.length} stale PRs`, color: "amber" });
          }

          const reportViewUrl = `${baseUrl}/api/reports/${report.id}/view?token=${delivery.id}`;

          const slackResult = await deliverReportToSlack({
            orgId: report.organization!.id,
            reportId: report.id,
            channel: slackChannel,
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
            results.push({ recipient: slackChannel, channel: "SLACK", status: "sent" });
          } else {
            throw new Error(slackResult.error || "Slack delivery failed");
          }
        } catch (slackError) {
          await prisma.reportDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "FAILED",
              error: slackError instanceof Error ? slackError.message : "Unknown",
            },
          });
          results.push({
            recipient: slackChannel,
            channel: "SLACK",
            status: "failed",
            error: slackError instanceof Error ? slackError.message : "Unknown",
          });
        }
      })();
    }

    await Promise.allSettled([...emailPromises, ...(slackPromise ? [slackPromise] : [])]);

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    // Update report status — but do NOT purge content (needed for the view link)
    if (sentCount > 0) {
      await prisma.report.update({
        where: { id: report.id },
        data: { status: "DELIVERED" },
      });
    }

    return NextResponse.json({
      success: sentCount > 0,
      message: `${sentCount} delivered, ${failedCount} failed`,
      results,
    });
  } catch (error) {
    console.error("[NexFlow] Report delivery failed:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
