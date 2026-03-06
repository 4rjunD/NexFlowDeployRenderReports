// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Setup Token Validation & Completion API
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

// GET — Validate onboarding token and return setup data
export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token },
      include: {
        organization: {
          include: {
            integrations: {
              select: { type: true, status: true },
            },
          },
        },
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Invalid setup link" },
        { status: 404 }
      );
    }

    if (onboarding.status === "COMPLETED") {
      return NextResponse.json(
        { error: "This setup has already been completed", completed: true },
        { status: 410 }
      );
    }

    if (new Date() > onboarding.expiresAt) {
      return NextResponse.json(
        { error: "This setup link has expired", expired: true },
        { status: 410 }
      );
    }

    const connectedIntegrations = onboarding.organization.integrations
      .filter((i) => i.status === "CONNECTED")
      .map((i) => i.type);

    return NextResponse.json({
      clientName: onboarding.clientName,
      email: onboarding.email,
      companyName: onboarding.organization.name,
      orgId: onboarding.orgId,
      connectedIntegrations,
      allIntegrations: onboarding.organization.integrations.map((i) => ({
        type: i.type,
        status: i.status,
      })),
    });
  } catch (error) {
    console.error("[NexFlow] Setup token validation failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST — Mark onboarding as completed
export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token },
    });

    if (!onboarding) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    if (onboarding.status === "COMPLETED") {
      return NextResponse.json({ error: "Already completed" }, { status: 410 });
    }

    await prisma.clientOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NexFlow] Setup completion failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
