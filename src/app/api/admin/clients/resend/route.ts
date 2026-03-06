// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Resend Onboarding Email API
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { sendOnboardingEmail } from "@/lib/email/send";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    // Find the latest onboarding for this org
    const existingOnboarding = await prisma.clientOnboarding.findFirst({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: { organization: true },
    });

    if (!existingOnboarding) {
      return NextResponse.json(
        { error: "No onboarding record found for this organization" },
        { status: 404 }
      );
    }

    // Generate a new token and update the expiry
    const newToken = crypto.randomUUID();
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.clientOnboarding.update({
      where: { id: existingOnboarding.id },
      data: {
        token: newToken,
        expiresAt: newExpiresAt,
        status: "PENDING",
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const setupUrl = `${baseUrl}/setup/${newToken}`;

    await sendOnboardingEmail({
      to: existingOnboarding.email,
      clientName: existingOnboarding.clientName,
      companyName: existingOnboarding.organization.name,
      setupUrl,
    });

    return NextResponse.json({ success: true, setupUrl });
  } catch (error) {
    console.error("[NexFlow] Failed to resend onboarding email:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
