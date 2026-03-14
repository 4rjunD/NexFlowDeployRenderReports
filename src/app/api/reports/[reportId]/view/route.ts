// ─────────────────────────────────────────────────────────────
// NexFlow — Public Report View (token-based, no auth required)
// Serves the full HTML report to clients via a secure link.
// Also tracks opens for delivery analytics.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { buildReportHtml } from "@/lib/pdf/report-html";
import { computeHealthScore } from "@/lib/scoring/health-score";

export async function GET(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const reportId = params.reportId;
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return new NextResponse(errorPage("Missing access token"), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Find the delivery record by token (we use the delivery ID as the token)
  const delivery = await prisma.reportDelivery.findUnique({
    where: { id: token },
    include: {
      report: {
        include: { organization: { select: { name: true, id: true } } },
      },
    },
  });

  if (!delivery || delivery.reportId !== reportId) {
    return new NextResponse(errorPage("Invalid or expired report link"), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (delivery.status !== "SENT") {
    return new NextResponse(errorPage("This report link is no longer active"), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const report = delivery.report;
  const content = (report.content as Record<string, any>) || {};
  const orgName = report.organization?.name || "Your Organization";
  const integrationData = content.integrationData || {};
  const reportDepth = (delivery.reportDepth as "EXECUTIVE" | "STANDARD" | "FULL") || null;
  const recipientName = delivery.recipientName || null;

  // Compute health score
  const priorDeliveries = await prisma.reportDelivery.count({
    where: { report: { orgId: report.organization?.id }, status: "SENT" },
  });
  const healthScore = computeHealthScore(integrationData, priorDeliveries <= 1);

  // Track the open (non-blocking)
  prisma.reportDelivery.update({
    where: { id: delivery.id },
    data: {
      openedAt: delivery.openedAt || new Date(),
      viewCount: { increment: 1 },
    },
  }).catch(() => {});

  // Check if PDF download requested
  const format = request.nextUrl.searchParams.get("format");
  if (format === "pdf") {
    try {
      const { htmlToPdf } = await import("@/lib/pdf/generate");
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
        reportDepth,
        recipientName,
      });
      const pdfBuffer = await htmlToPdf(html);
      const sanitizedTitle = report.title.replace(/[^a-zA-Z0-9\s\-–—]/g, "").replace(/\s+/g, "-").slice(0, 80);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sanitizedTitle}.pdf"`,
        },
      });
    } catch {
      return new NextResponse(errorPage("PDF generation failed. Try viewing in browser instead."), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // Serve the HTML report with download bar, filtered by recipient's depth
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
    reportDepth,
    recipientName,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache",
    },
  });
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NexFlow Report</title>
<style>
  body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f9fafb;margin:0}
  .card{text-align:center;padding:48px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:400px}
  h1{font-size:20px;margin:0 0 8px;color:#111}
  p{font-size:14px;color:#6b7280;margin:0}
  .brand{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:24px}
</style></head>
<body><div class="card"><div class="brand">NexFlow Engineering Intelligence</div><h1>Report Unavailable</h1><p>${message}</p></div></body>
</html>`;
}
