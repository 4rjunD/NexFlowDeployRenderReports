// ─────────────────────────────────────────────────────────────
// NexFlow — Delivery Analytics (Enterprise)
// Tracks report opens, view counts, and provides delivery insights.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

// GET — Fetch delivery analytics for the org
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    if (!user.orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // Get last N deliveries for this org
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");

    const deliveries = await prisma.reportDelivery.findMany({
      where: {
        report: { orgId: user.orgId },
        status: "SENT",
      },
      orderBy: { sentAt: "desc" },
      take: limit,
      include: {
        report: {
          select: { title: true, periodStart: true, periodEnd: true },
        },
      },
    });

    const total = deliveries.length;
    const opened = deliveries.filter((d) => d.openedAt != null).length;
    const unopened = total - opened;
    const avgViewCount = total > 0
      ? Math.round(deliveries.reduce((sum, d) => sum + d.viewCount, 0) / total)
      : 0;

    // Unopened reports older than 3 days — candidates for follow-up
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const staleUnopened = deliveries.filter(
      (d) => d.openedAt == null && d.sentAt && d.sentAt < threeDaysAgo
    );

    return NextResponse.json({
      summary: {
        totalDeliveries: total,
        opened,
        unopened,
        avgViewCount,
        staleUnopenedCount: staleUnopened.length,
      },
      deliveries: deliveries.map((d) => ({
        id: d.id,
        reportTitle: d.report.title,
        channel: d.channel,
        recipientEmail: d.recipientEmail,
        sentAt: d.sentAt,
        openedAt: d.openedAt,
        viewCount: d.viewCount,
        periodStart: d.report.periodStart,
        periodEnd: d.report.periodEnd,
      })),
      followUpCandidates: staleUnopened.map((d) => ({
        id: d.id,
        reportTitle: d.report.title,
        recipientEmail: d.recipientEmail,
        sentAt: d.sentAt,
        daysSinceSent: d.sentAt ? Math.floor((Date.now() - d.sentAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
      })),
    });
  } catch (error) {
    console.error("[NexFlow Analytics] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST — Track a report open (called when client opens report link)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deliveryId } = body;

    if (!deliveryId || typeof deliveryId !== "string") {
      return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
    }

    const delivery = await prisma.reportDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    await prisma.reportDelivery.update({
      where: { id: deliveryId },
      data: {
        openedAt: delivery.openedAt || new Date(),
        viewCount: { increment: 1 },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NexFlow Analytics] Track error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
