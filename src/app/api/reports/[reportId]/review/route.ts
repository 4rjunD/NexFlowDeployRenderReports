import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  notes: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { reportId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only admins can review reports" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const report = await prisma.report.findUnique({
      where: { id: params.reportId },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: `Report is not pending review (current status: ${report.status})` },
        { status: 400 }
      );
    }

    const { action, notes } = parsed.data;
    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    // Resolve reviewer — look up by id first, fall back to email
    let reviewerId: string | null = null;
    if (user.id) {
      const byId = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
      reviewerId = byId?.id ?? null;
    }
    if (!reviewerId && user.email) {
      const byEmail = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
      reviewerId = byEmail?.id ?? null;
    }

    const updated = await prisma.report.update({
      where: { id: params.reportId },
      data: {
        status: newStatus,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
      },
      include: {
        team: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[NexFlow] Report review failed:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
