import prisma from "../src/lib/db/prisma";
import { buildReportHtml } from "../src/lib/pdf/report-html";
import { computeHealthScore } from "../src/lib/scoring/health-score";
import fs from "fs";
import { execSync } from "child_process";

async function main() {
  const report = await prisma.report.findFirst({
    where: { orgId: "cmmux89m400006jwtnux04pb5" },
    orderBy: { createdAt: "desc" },
  });
  const org = await prisma.organization.findUnique({
    where: { id: "cmmux89m400006jwtnux04pb5" },
  });
  if (!report || !org) { console.log("Not found"); return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = report.content as Record<string, any>;
  const integrationData = content.integrationData || {};
  const healthScore = computeHealthScore(integrationData, true);
  const html = buildReportHtml({
    title: report.title || "Engineering Brief — Resourceful",
    orgName: org.name,
    periodStart: report.periodStart || new Date(Date.now() - 90*24*60*60*1000),
    periodEnd: report.periodEnd || new Date(),
    generatedAt: report.generatedAt || new Date(),
    aiNarrative: report.aiNarrative,
    content,
    showDownloadBar: true,
    healthScore,
  });
  fs.writeFileSync("/tmp/resourceful-report.html", html, "utf-8");
  console.log("Written to /tmp/resourceful-report.html");
  execSync('open "/tmp/resourceful-report.html"');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
