import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { sendReportEmail } from "@/lib/email/send";
import { buildReportHtml, computeKPIs } from "@/lib/pdf/report-html";
import { htmlToPdf } from "@/lib/pdf/generate";
import { computeHealthScore } from "@/lib/scoring/health-score";

const deliverSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
});

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

    const { recipientEmail } = parsed.data;
    const content = (report.content as Record<string, any>) || {};
    const orgName = report.organization?.name || "Your Organization";
    const integrationData = content.integrationData || {};

    // Determine if this is the first report for the org
    const priorDeliveries = await prisma.reportDelivery.count({
      where: {
        report: { orgId: report.organization?.id },
        status: "SENT",
      },
    });
    const isFirstReport = priorDeliveries === 0;
    const healthScore = computeHealthScore(integrationData, isFirstReport);

    // Generate the PDF
    const reportHtml = buildReportHtml({
      title: report.title,
      orgName,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      generatedAt: report.generatedAt,
      aiNarrative: report.aiNarrative,
      content,
      showDownloadBar: false,
      healthScore,
    });

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await htmlToPdf(reportHtml);
    } catch (pdfError) {
      console.error("[NexFlow] PDF generation failed:", pdfError);
      return NextResponse.json(
        { error: "Failed to generate PDF. Please try again." },
        { status: 500 }
      );
    }

    // Extract KPIs for the email preview
    const kpis = computeKPIs(integrationData);

    // Create delivery record
    const delivery = await prisma.reportDelivery.create({
      data: {
        reportId: report.id,
        channel: "EMAIL",
        recipientEmail,
        status: "PENDING",
      },
    });

    // Send email with actual PDF attached
    try {
      await sendReportEmail({
        to: recipientEmail,
        subject: `${report.title} — NexFlow Report`,
        reportTitle: report.title,
        orgName,
        kpis,
        pdfBuffer,
        healthScore,
      });

      // Update delivery + report status
      await prisma.$transaction([
        prisma.reportDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", sentAt: new Date() },
        }),
        prisma.report.update({
          where: { id: report.id },
          data: { status: "DELIVERED" },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: `Report sent to ${recipientEmail}`,
        deliveryId: delivery.id,
      });
    } catch (emailError) {
      await prisma.reportDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          error:
            emailError instanceof Error
              ? emailError.message
              : "Unknown email error",
        },
      });

      console.error("[NexFlow] Email delivery failed:", emailError);
      return NextResponse.json(
        {
          error: "Failed to send email",
          details:
            emailError instanceof Error ? emailError.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[NexFlow] Report delivery failed:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
