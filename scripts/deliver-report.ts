// Quick script to deliver a report by ID to an email address
// Usage: npx tsx scripts/deliver-report.ts <reportId> <email>

import prisma from "../src/lib/db/prisma";
import { buildReportHtml, computeKPIs } from "../src/lib/pdf/report-html";
import { htmlToPdf } from "../src/lib/pdf/generate";
import { sendReportEmail } from "../src/lib/email/send";
import { computeHealthScore } from "../src/lib/scoring/health-score";

async function main() {
  const reportId = process.argv[2];
  const email = process.argv[3];

  if (!reportId || !email) {
    console.error("Usage: npx tsx scripts/deliver-report.ts <reportId> <email>");
    process.exit(1);
  }

  console.log(`Loading report ${reportId}...`);
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { organization: { select: { name: true, id: true } } },
  });

  if (!report) {
    console.error("Report not found");
    process.exit(1);
  }

  console.log(`Report: ${report.title} (${report.status})`);

  const content = (report.content as Record<string, any>) || {};
  const integrationData = content.integrationData || {};
  const orgName = report.organization?.name || "Client";

  // Check first report
  const priorDeliveries = await prisma.reportDelivery.count({
    where: { report: { orgId: report.organization?.id }, status: "SENT" },
  });
  const isFirstReport = priorDeliveries === 0;
  console.log(`First report: ${isFirstReport} (${priorDeliveries} prior deliveries)`);

  // Compute health score
  const healthScore = computeHealthScore(integrationData, isFirstReport);
  console.log(`Health Score: ${healthScore.overall} (${healthScore.grade})`);

  // Build HTML and PDF
  console.log("Building HTML...");
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

  console.log("Generating PDF via Puppeteer...");
  const pdfBuffer = await htmlToPdf(reportHtml);
  console.log(`PDF generated: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  // Extract KPIs
  const kpis = computeKPIs(integrationData);

  // Create delivery record
  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId: report.id,
      channel: "EMAIL",
      recipientEmail: email,
      status: "PENDING",
    },
  });

  // Send email
  console.log(`Sending email to ${email}...`);
  try {
    await sendReportEmail({
      to: email,
      subject: `${report.title} — NexFlow Report`,
      reportTitle: report.title,
      orgName,
      kpis,
      pdfBuffer,
      healthScore,
    });

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

    console.log(`Report delivered to ${email}`);
  } catch (error) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: (error as Error).message },
    });
    console.error("Delivery failed:", error);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
