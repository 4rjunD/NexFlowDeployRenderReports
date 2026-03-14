import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { sendReportEmail } from "@/lib/email/send";
import { computeKPIs } from "@/lib/pdf/report-html";
import { computeHealthScore } from "@/lib/scoring/health-score";
import { subjectForRole } from "@/lib/delivery/role-sections";

const resendSchema = z.object({
  deliveryIds: z.array(z.string()).min(1).max(100).optional(),
  resendAllFailed: z.boolean().optional(),
}).refine(
  (d) => d.resendAllFailed || (d.deliveryIds && d.deliveryIds.length > 0),
  { message: "Specify deliveryIds or resendAllFailed" }
);

export async function POST(
  request: Request,
  { params }: { params: { reportId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as any;
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await request.json();
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const report = await prisma.report.findUnique({
      where: { id: params.reportId },
      include: { organization: { select: { name: true, id: true } } },
    });

    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Find failed deliveries to resend
    const whereClause: any = {
      reportId: params.reportId,
      channel: "EMAIL",
      status: { in: ["FAILED", "BOUNCED"] },
    };

    if (parsed.data.deliveryIds && !parsed.data.resendAllFailed) {
      whereClause.id = { in: parsed.data.deliveryIds };
    }

    const failedDeliveries = await prisma.reportDelivery.findMany({
      where: whereClause,
    });

    if (failedDeliveries.length === 0) {
      return NextResponse.json({ error: "No failed deliveries found to resend" }, { status: 400 });
    }

    // Check unsubscribed recipients
    const orgId = report.organization?.id;
    const unsubscribedEmails = new Set<string>();
    if (orgId) {
      const unsubbed = await prisma.reportRecipient.findMany({
        where: { orgId, unsubscribedAt: { not: null } },
        select: { email: true },
      });
      for (const u of unsubbed) unsubscribedEmails.add(u.email);
    }

    const content = (report.content as Record<string, any>) || {};
    const orgName = report.organization?.name || "Your Organization";
    const integrationData = content.integrationData || {};
    const priorDeliveries = await prisma.reportDelivery.count({
      where: { report: { orgId }, status: "SENT" },
    });
    const healthScore = computeHealthScore(integrationData, priorDeliveries <= 1);
    const kpis = computeKPIs(integrationData);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

    const topDiscoveries: string[] = [];
    if (content.blockers?.blockers?.length) topDiscoveries.push(`${content.blockers.blockers.length} blocker signals detected in Slack`);
    const jira = integrationData.jira as Record<string, any> | undefined;
    if (jira?.issues?.overdue?.length) topDiscoveries.push(`${jira.issues.overdue.length} overdue tickets need attention`);

    const results: { deliveryId: string; email: string; status: string; error?: string }[] = [];

    // Process in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < failedDeliveries.length; i += BATCH_SIZE) {
      const batch = failedDeliveries.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (delivery) => {
        const email = delivery.recipientEmail;
        if (!email) {
          results.push({ deliveryId: delivery.id, email: "unknown", status: "skipped", error: "No email address" });
          return;
        }

        if (unsubscribedEmails.has(email)) {
          results.push({ deliveryId: delivery.id, email, status: "skipped", error: "Recipient unsubscribed" });
          return;
        }

        // Reset the delivery record to PENDING
        await prisma.reportDelivery.update({
          where: { id: delivery.id },
          data: { status: "PENDING", error: null, bouncedAt: null },
        });

        const reportViewUrl = `${baseUrl}/api/reports/${params.reportId}/view?token=${delivery.id}`;
        const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;
        const subject = delivery.recipientRole
          ? subjectForRole(delivery.recipientRole, report.title)
          : `${report.title} — NexFlow Report`;

        try {
          await sendReportEmail({
            to: email,
            subject,
            reportTitle: report.title,
            orgName,
            kpis,
            reportViewUrl,
            pdfDownloadUrl,
            healthScore,
            topDiscoveries: topDiscoveries.slice(0, 3),
            recipientName: delivery.recipientName || undefined,
            recipientRole: delivery.recipientRole || undefined,
            reportDepth: delivery.reportDepth || undefined,
          });

          await prisma.reportDelivery.update({
            where: { id: delivery.id },
            data: { status: "SENT", sentAt: new Date(), error: null },
          });
          results.push({ deliveryId: delivery.id, email, status: "sent" });
        } catch (err) {
          await prisma.reportDelivery.update({
            where: { id: delivery.id },
            data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown" },
          });
          results.push({ deliveryId: delivery.id, email, status: "failed", error: err instanceof Error ? err.message : "Unknown" });
        }
      });
      await Promise.allSettled(promises);
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      success: sent > 0,
      message: `${sent} resent, ${failed} failed, ${skipped} skipped`,
      sent,
      failed,
      skipped,
      results,
    });
  } catch (error) {
    console.error("[NexFlow] Resend failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
