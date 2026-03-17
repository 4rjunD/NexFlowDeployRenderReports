/**
 * Generate a report for a given org and open it in the browser.
 * Usage: npx tsx scripts/_generate-and-open.ts "Company Name"
 */
import prisma from "../src/lib/db/prisma";
import { generateReportInBackground } from "../src/lib/reports/generate-background";
import { buildReportHtml } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";
import fs from "fs";
import { execSync } from "child_process";

const COMPANY_NAME = process.argv[2] || "Resourceful";

async function main() {
  // Find the org
  const org = await prisma.organization.findFirst({
    where: { name: COMPANY_NAME },
  });
  if (!org) {
    console.error(`Org "${COMPANY_NAME}" not found`);
    process.exit(1);
  }
  console.log("Org:", org.id, org.name);

  // Check integrations
  const integrations = await prisma.integration.findMany({
    where: { orgId: org.id, status: "CONNECTED" },
  });
  console.log("Connected:", integrations.map((i) => i.type).join(", ") || "none");

  if (integrations.length === 0) {
    console.error("No connected integrations — nothing to generate.");
    process.exit(1);
  }

  // Create a draft report
  const now = new Date();
  const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Count existing reports for this org
  const reportCount = await prisma.report.count({ where: { orgId: org.id } });

  const report = await prisma.report.create({
    data: {
      orgId: org.id,
      title: `Engineering Brief: ${COMPANY_NAME}`,
      type: "WEEKLY_DIGEST",
      status: "DRAFT",
      content: { reportNumber: reportCount + 1 },
      periodStart,
      periodEnd: now,
    },
  });
  console.log("Report created:", report.id, "— generating...");

  // Generate
  await generateReportInBackground(report.id, org.id);

  // Reload the report
  const finished = await prisma.report.findUnique({ where: { id: report.id } });
  if (!finished || finished.status === "DRAFT") {
    console.error("Generation failed. Check logs above.");
    process.exit(1);
  }

  console.log("Status:", finished.status);
  console.log("Title:", finished.title);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = finished.content as Record<string, any>;
  const integrationData = content.integrationData || {};
  const healthScore = computeHealthScore(integrationData, true);

  console.log("Health score:", healthScore.overall, healthScore.grade);
  console.log("Action items:", content.actionItems?.length || 0);
  console.log("Has narrative:", !!finished.aiNarrative);

  // Build HTML and open
  const html = buildReportHtml({
    title: finished.title || `Engineering Brief — ${COMPANY_NAME}`,
    orgName: org.name,
    periodStart: finished.periodStart || periodStart,
    periodEnd: finished.periodEnd || now,
    generatedAt: finished.generatedAt || now,
    aiNarrative: finished.aiNarrative,
    content,
    showDownloadBar: true,
    healthScore,
  });

  const outPath = `/tmp/${COMPANY_NAME.toLowerCase().replace(/\s+/g, "-")}-report.html`;
  fs.writeFileSync(outPath, html, "utf-8");
  console.log("Written to:", outPath);
  execSync(`open "${outPath}"`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
