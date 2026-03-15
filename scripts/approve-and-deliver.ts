import prisma from "../src/lib/db/prisma";
import { sendReportEmail } from "../src/lib/email/send";
import { computeKPIs } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";

const REPORT_ID = process.argv[2];
const EMAIL = process.argv[3] || "arjundixit@nexflowinc.com";
const BASE_URL = "https://nexflowdeployrenderreports.onrender.com";

async function main() {
  if (!REPORT_ID) {
    console.error("Usage: npx tsx scripts/approve-and-deliver.ts <reportId> [email]");
    process.exit(1);
  }

  // 1. Fetch report
  const report = await prisma.report.findUnique({
    where: { id: REPORT_ID },
    include: { organization: { select: { name: true, id: true } } },
  });

  if (!report) {
    console.error("Report not found:", REPORT_ID);
    process.exit(1);
  }

  console.log("Report:", report.title);
  console.log("Status:", report.status);
  console.log("Org:", report.organization?.name);

  // 2. Approve if needed
  if (report.status !== "APPROVED" && report.status !== "DELIVERED") {
    await prisma.report.update({
      where: { id: REPORT_ID },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    console.log("-> Approved");
  }

  // 3. Compute health score and KPIs
  const content = (report.content as Record<string, any>) || {};
  const integrationData = content.integrationData || {};

  const priorDeliveries = await prisma.reportDelivery.count({
    where: { report: { orgId: report.orgId }, status: "SENT" },
  });
  const isFirstReport = priorDeliveries === 0;
  const healthScore = computeHealthScore(integrationData, isFirstReport);
  const kpis = computeKPIs(integrationData);

  console.log("\nHealth Score:", healthScore.overall, healthScore.grade);
  console.log("KPIs:", kpis.map((k) => `${k.label}: ${k.value}`).join(" | "));

  // 4. Extract top discoveries for email preview
  const discoveries: string[] = [];
  if (content.blockers?.blockers?.length) {
    discoveries.push(`${content.blockers.blockers.length} blocker signals detected in Slack`);
  }
  const gh = integrationData.github as Record<string, any> | undefined;
  if (gh?.pullRequests?.stalePrs?.length) {
    discoveries.push(`${gh.pullRequests.stalePrs.length} PRs stale for 7+ days`);
  }
  if (gh?.commits?.total) {
    discoveries.push(`${gh.commits.total} commits shipped this period`);
  }
  if (gh?.pullRequests?.merged) {
    discoveries.push(`${gh.pullRequests.merged} PRs merged`);
  }
  const sl = integrationData.slack as Record<string, any> | undefined;
  if (sl?.totalMessages) {
    discoveries.push(`${sl.totalMessages} Slack messages analyzed`);
  }

  console.log("Discoveries:", discoveries);

  // 5. Create delivery record
  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId: REPORT_ID,
      channel: "EMAIL",
      recipientEmail: EMAIL,
      recipientName: "Arjun",
      status: "PENDING",
    },
  });

  // 6. Build URLs
  const reportViewUrl = `${BASE_URL}/api/reports/${REPORT_ID}/view?token=${delivery.id}`;
  const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;
  const orgName = report.organization?.name || "NexFlow Inc";

  console.log("\nView URL:", reportViewUrl);
  console.log("Sending to:", EMAIL);

  // 7. Send email
  const result = await sendReportEmail({
    to: EMAIL,
    subject: `${report.title} — NexFlow Report`,
    reportTitle: report.title,
    orgName,
    kpis,
    reportViewUrl,
    pdfDownloadUrl,
    healthScore,
    topDiscoveries: discoveries.slice(0, 3),
    recipientName: "Arjun",
  });

  // 8. Update delivery status
  await prisma.reportDelivery.update({
    where: { id: delivery.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      deliveredAt: new Date(),
      smtpResponse: result.response,
    },
  });

  // 9. Update report status to DELIVERED
  await prisma.report.update({
    where: { id: REPORT_ID },
    data: { status: "DELIVERED" },
  });

  console.log("Email sent! SMTP:", result.response);
  console.log("Report status -> DELIVERED");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
