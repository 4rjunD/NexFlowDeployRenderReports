/**
 * Send a test report email with custom message + proper report view link.
 * Creates a ReportDelivery record so the view URL works.
 * Usage: npx tsx scripts/_send-test-report-email.ts
 */
import prisma from "../src/lib/db/prisma";
import { sendReportEmail } from "../src/lib/email/send";
import { computeKPIs } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";

const TO_EMAIL = "arjundixit3508@gmail.com";
const ORG_ID = "cmmux89m400006jwtnux04pb5";
const BASE_URL = process.env.NEXTAUTH_URL || "https://nexflowdeployrenderreports.onrender.com";

async function main() {
  const report = await prisma.report.findFirst({
    where: { orgId: ORG_ID },
    orderBy: { createdAt: "desc" },
  });
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
  });
  if (!report || !org) {
    console.error("Report or org not found");
    process.exit(1);
  }

  // Approve the report if needed
  if (report.status !== "APPROVED" && report.status !== "DELIVERED") {
    await prisma.report.update({
      where: { id: report.id },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    console.log("Report approved");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = report.content as Record<string, any>;
  const integrationData = content.integrationData || {};
  const healthScore = computeHealthScore(integrationData, true);

  // Create a delivery record so the view URL works
  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId: report.id,
      channel: "EMAIL",
      recipientEmail: TO_EMAIL,
      recipientName: "Nick Hadfield",
      status: "SENT",
      sentAt: new Date(),
    },
  });
  console.log("Delivery record created:", delivery.id);

  // Build URLs
  const reportViewUrl = `${BASE_URL}/api/reports/${report.id}/view?token=${delivery.id}`;
  const pdfDownloadUrl = `${BASE_URL}/api/reports/${report.id}/view?token=${delivery.id}&format=pdf`;

  // Compute KPIs for email
  const kpis = computeKPIs(integrationData);

  // Build discoveries for email preview
  const topDiscoveries: string[] = [];
  if (content.integrationData?.github) {
    const gh = content.integrationData.github;
    const commits = gh.commits?.total || 0;
    const prs = gh.pullRequests?.merged || 0;
    if (commits > 0 && prs === 0) {
      topDiscoveries.push("Code is shipping with no review checkpoints. One bad change could break your product with no easy way to undo it.");
    }
    if (gh.issues?.total === 0) {
      topDiscoveries.push("No feature or decision tracking in place. There's no record of what was shipped or why.");
    }
  }
  topDiscoveries.push("We have specific recommendations to tighten up your shipping process before it becomes a problem.");

  // Health score for email
  const hsEmail = {
    overall: healthScore.overall,
    grade: healthScore.grade,
    gradeColor: healthScore.overall >= 80 ? "#30a46c" : healthScore.overall >= 60 ? "#3b82f6" : healthScore.overall >= 40 ? "#e5940c" : "#e5484d",
    dimensions: healthScore.dimensions.map((d) => ({
      label: d.label,
      score: d.score,
      color: d.score >= 80 ? "#30a46c" : d.score >= 60 ? "#3b82f6" : d.score >= 40 ? "#e5940c" : "#e5484d",
    })),
  };

  // Custom message
  const customMessage = `Your first engineering brief for Resourceful is ready. We dug into your GitHub activity over the past 90 days and found a few things worth talking about.<br><br>The big one: right now, code is going straight to production with no safety checkpoints and no record of what's being built or why. That's fine when things are small, but it becomes a real problem fast. The good news is the fixes are quick.<br><br>There are a few things I'd like to walk through together on our next call, especially around how code is getting shipped. Nothing scary, just some easy wins that will save you headaches down the road.`;

  console.log("Sending test email to:", TO_EMAIL);
  console.log("Report:", report.id, report.title);
  console.log("Health:", healthScore.overall, healthScore.grade);
  console.log("View URL:", reportViewUrl);

  const result = await sendReportEmail({
    to: TO_EMAIL,
    subject: `Your Engineering Brief is Ready, Nick`,
    reportTitle: "Engineering Brief #1",
    orgName: org.name,
    kpis,
    reportViewUrl,
    pdfDownloadUrl,
    healthScore: hsEmail,
    topDiscoveries,
    recipientName: "Nick Hadfield",
    customMessage,
    nextReportDate: "Monday, March 23",
  });

  // Update delivery with SMTP response
  await prisma.reportDelivery.update({
    where: { id: delivery.id },
    data: { smtpResponse: result.response },
  });

  console.log("Email sent:", result.messageId);
  console.log("Response:", result.response);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
