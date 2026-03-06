// ─────────────────────────────────────────────────────────────
// NexFlow — Report PDF Preview (HTML) & Download (actual PDF)
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { buildReportHtml } from "@/lib/pdf/report-html";
import { htmlToPdf } from "@/lib/pdf/generate";
import { computeHealthScore } from "@/lib/scoring/health-score";

export async function GET(
  request: Request,
  { params }: { params: { reportId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as any;
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const report = await prisma.report.findUnique({
    where: { id: params.reportId },
    include: { organization: { select: { name: true, id: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const content = (report.content as Record<string, any>) || {};
  const orgName = report.organization?.name || "Client";
  const integrationData = content.integrationData || {};

  // Determine if this is the first report for the org (no prior deliveries)
  const priorDeliveries = await prisma.reportDelivery.count({
    where: {
      report: { orgId: report.organization?.id },
      status: "SENT",
    },
  });
  const isFirstReport = priorDeliveries === 0;

  // Compute health score
  const healthScore = computeHealthScore(integrationData, isFirstReport);

  // Check if ?format=pdf to return actual PDF binary
  const url = new URL(request.url);
  const formatPdf = url.searchParams.get("format") === "pdf";

  if (formatPdf) {
    const html = buildReportHtml({
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

    const pdfBuffer = await htmlToPdf(html);
    const sanitizedTitle = report.title.replace(/[^a-zA-Z0-9\s\-–—]/g, "").replace(/\s+/g, "-").slice(0, 80);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizedTitle}.pdf"`,
      },
    });
  }

  // Default: HTML preview with download bar
  const html = buildReportHtml({
    title: report.title,
    orgName,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    generatedAt: report.generatedAt,
    aiNarrative: report.aiNarrative,
    content,
    showDownloadBar: true,
    healthScore,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
