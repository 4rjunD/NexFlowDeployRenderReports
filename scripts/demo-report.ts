/**
 * Generate a fresh report with the new AI voice and deliver to email.
 * Usage: npx tsx scripts/demo-report.ts <orgId> <email>
 */
import prisma from "../src/lib/db/prisma";
import { generateReportInBackground } from "../src/lib/reports/generate-background";
import { sendReportEmail } from "../src/lib/email/send";
import { computeKPIs } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";

const ORG_ID = process.argv[2] || "cmmrwda100000as3s86wpgact";
const EMAIL = process.argv[3] || "arjundixit@nexflowinc.com";
const BASE_URL = "https://nexflowdeployrenderreports.onrender.com";

async function main() {
  console.log("Creating report for org:", ORG_ID);

  // 14-day lookback for first useful report
  const now = new Date();
  const periodStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const report = await prisma.report.create({
    data: {
      type: "WEEKLY_DIGEST",
      title: "Generating...",
      summary: "Generating report...",
      content: {},
      status: "GENERATED",
      periodStart,
      periodEnd: now,
      orgId: ORG_ID,
    },
  });
  console.log("Report created:", report.id);

  // Generate in foreground (not background) so we can wait
  console.log("Generating report (pulling live data + AI narrative)...");
  await generateReportInBackground(report.id, ORG_ID);
  console.log("Generation complete.");

  // Reload report
  const generated = await prisma.report.findUnique({
    where: { id: report.id },
    include: { organization: { select: { name: true } } },
  });

  if (!generated) {
    console.error("Report not found after generation");
    process.exit(1);
  }

  console.log("Title:", generated.title);
  console.log("Status:", generated.status);
  console.log("AI Narrative length:", generated.aiNarrative?.length || 0);

  // Approve
  await prisma.report.update({
    where: { id: report.id },
    data: { status: "APPROVED", reviewedAt: new Date() },
  });

  // Compute health score + KPIs
  const content = (generated.content as Record<string, any>) || {};
  const integrationData = content.integrationData || {};
  const healthScore = computeHealthScore(integrationData, false);
  const kpis = computeKPIs(integrationData);

  console.log("\nHealth Score:", healthScore.overall, healthScore.grade);
  console.log("KPIs:", kpis.map((k) => `${k.label}: ${k.value}`).join(" | "));

  // Extract discoveries
  const discoveries: string[] = [];
  const gh = integrationData.github as Record<string, any> | undefined;
  const sl = integrationData.slack as Record<string, any> | undefined;
  if (gh?.commits?.total) discoveries.push(`${gh.commits.total} commits analyzed across ${gh?.commits?.byAuthor ? Object.keys(gh.commits.byAuthor).length : 'multiple'} contributors`);
  if (gh?.pullRequests?.merged) discoveries.push(`${gh.pullRequests.merged} PRs merged this period`);
  if (sl?.totalMessages) discoveries.push(`${sl.totalMessages} Slack messages analyzed for team patterns`);
  if (content.blockers?.blockers?.length) discoveries.push(`${content.blockers.blockers.length} blocker signals detected`);

  // Create delivery + send email
  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId: report.id,
      channel: "EMAIL",
      recipientEmail: EMAIL,
      recipientName: "Arjun",
      status: "PENDING",
    },
  });

  const reportViewUrl = `${BASE_URL}/api/reports/${report.id}/view?token=${delivery.id}`;
  const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;
  const orgName = generated.organization?.name || "NexFlow Inc";

  console.log("\nSending to:", EMAIL);
  const result = await sendReportEmail({
    to: EMAIL,
    subject: `${generated.title} — Your NexFlow Intelligence Briefing`,
    reportTitle: generated.title,
    orgName,
    kpis,
    reportViewUrl,
    pdfDownloadUrl,
    healthScore,
    topDiscoveries: discoveries.slice(0, 3),
    recipientName: "Arjun",
  });

  await prisma.reportDelivery.update({
    where: { id: delivery.id },
    data: { status: "SENT", sentAt: new Date(), deliveredAt: new Date(), smtpResponse: result.response },
  });

  await prisma.report.update({
    where: { id: report.id },
    data: { status: "DELIVERED" },
  });

  console.log("Email sent! SMTP:", result.response);
  console.log("\nView URL:", reportViewUrl);

  // Also write the HTML report to /tmp for local preview
  const { buildReportHtml } = require("../src/lib/pdf/report-html");
  const html = buildReportHtml({
    title: generated.title,
    summary: generated.summary || "",
    narrative: generated.aiNarrative || "",
    content,
    healthScore,
    periodStart: generated.periodStart.toISOString(),
    periodEnd: generated.periodEnd.toISOString(),
  });
  const fs = require("fs");
  fs.writeFileSync("/tmp/nexflow-demo-report.html", html);
  console.log("Local preview: /tmp/nexflow-demo-report.html");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
