/**
 * Send a report email to a client with "View Full Report" linking to Render.
 *
 * Usage:
 *   npx tsx scripts/send-report-email.ts "Resourceful" "nick@example.com" "Nick Hadfield"
 *   npx tsx scripts/send-report-email.ts "Resourceful" "arjundixit3508@gmail.com" "Nick Hadfield" --custom "Your brief is ready..."
 *
 * If no email is provided, prints the report info without sending.
 */
import prisma from "../src/lib/db/prisma";
import { sendReportEmail } from "../src/lib/email/send";
import { computeKPIs } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";

const BASE_URL = process.env.NEXTAUTH_URL || "https://nexflowdeployrenderreports.onrender.com";

const COMPANY_NAME = process.argv[2];
const TO_EMAIL = process.argv[3];
const RECIPIENT_NAME = process.argv[4] || "";

if (!COMPANY_NAME || !TO_EMAIL) {
  console.error('Usage: npx tsx scripts/send-report-email.ts "Company" "email@example.com" "Recipient Name"');
  process.exit(1);
}

async function main() {
  // Find the org
  const org = await prisma.organization.findFirst({
    where: { name: COMPANY_NAME },
  });
  if (!org) {
    console.error(`Org "${COMPANY_NAME}" not found`);
    process.exit(1);
  }

  // Find the latest report
  const report = await prisma.report.findFirst({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
  });
  if (!report) {
    console.error(`No reports found for "${COMPANY_NAME}"`);
    process.exit(1);
  }

  // Approve if needed
  if (report.status !== "APPROVED" && report.status !== "DELIVERED") {
    await prisma.report.update({
      where: { id: report.id },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = report.content as Record<string, any>;
  const integrationData = content.integrationData || {};
  const healthScore = computeHealthScore(integrationData, true);
  const reportNumber = content.reportNumber || 1;

  // Create a delivery record (this is the token for the view URL)
  const delivery = await prisma.reportDelivery.create({
    data: {
      reportId: report.id,
      channel: "EMAIL",
      recipientEmail: TO_EMAIL,
      recipientName: RECIPIENT_NAME || null,
      status: "SENT",
      sentAt: new Date(),
    },
  });

  // Build URLs
  const reportViewUrl = `${BASE_URL}/api/reports/${report.id}/view?token=${delivery.id}`;
  const pdfDownloadUrl = `${reportViewUrl}&format=pdf`;

  // Compute KPIs
  const kpis = computeKPIs(integrationData);

  // Build top discoveries from the data
  const topDiscoveries: string[] = [];
  const gh = integrationData.github;
  if (gh) {
    if (gh.commits?.total > 0 && (gh.pullRequests?.merged || 0) === 0) {
      topDiscoveries.push(
        "Code is shipping with no review checkpoints. One bad change could break your product with no easy way to undo it."
      );
    }
    if ((gh.issues?.total || 0) === 0 && gh.commits?.total > 0) {
      topDiscoveries.push(
        "No feature or decision tracking in place. There's no record of what was shipped or why."
      );
    }
  }
  if (topDiscoveries.length < 3) {
    topDiscoveries.push(
      "We have specific recommendations ready. See the full brief for your action plan."
    );
  }

  // Health score for email
  const hsEmail = {
    overall: healthScore.overall,
    grade: healthScore.grade,
    gradeColor:
      healthScore.overall >= 80
        ? "#30a46c"
        : healthScore.overall >= 60
        ? "#3b82f6"
        : healthScore.overall >= 40
        ? "#e5940c"
        : "#e5484d",
    dimensions: healthScore.dimensions.map((d) => ({
      label: d.label,
      score: d.score,
      color:
        d.score >= 80
          ? "#30a46c"
          : d.score >= 60
          ? "#3b82f6"
          : d.score >= 40
          ? "#e5940c"
          : "#e5484d",
    })),
  };

  // Custom message
  const firstName = RECIPIENT_NAME ? RECIPIENT_NAME.split(" ")[0] : "";
  const customMessage =
    `Your ${reportNumber === 1 ? "first " : ""}engineering brief for ${org.name} is ready. ` +
    `We dug into your GitHub activity over the past 90 days and found a few things worth talking about.` +
    `<br><br>` +
    `There are some things we need to address on our next call around how code is getting shipped. ` +
    `Nothing scary, just some quick wins that will save you real headaches down the road.` +
    `<br><br>` +
    `Take a look at the full brief below.`;

  console.log("Sending to:", TO_EMAIL);
  console.log("Org:", org.name);
  console.log("Report:", report.id);
  console.log("Health:", healthScore.overall, healthScore.grade);
  console.log("View URL:", reportViewUrl);

  const result = await sendReportEmail({
    to: TO_EMAIL,
    subject: `Your Engineering Brief is Ready${firstName ? `, ${firstName}` : ""}`,
    reportTitle: `Engineering Brief #${reportNumber}`,
    orgName: org.name,
    kpis,
    reportViewUrl,
    pdfDownloadUrl,
    healthScore: hsEmail,
    topDiscoveries,
    recipientName: RECIPIENT_NAME || undefined,
    customMessage,
  });

  // Track the send
  await prisma.reportDelivery.update({
    where: { id: delivery.id },
    data: { smtpResponse: result.response },
  });

  // Mark report as delivered
  await prisma.report.update({
    where: { id: report.id },
    data: { status: "DELIVERED" },
  });

  console.log("Sent:", result.messageId);
  console.log("Done.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
