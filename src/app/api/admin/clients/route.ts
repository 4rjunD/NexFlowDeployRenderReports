// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Admin Client Management API
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";
import { sendOnboardingEmail } from "@/lib/email/send";

const createClientSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  email: z.string().email("Valid email is required"),
  companyName: z.string().min(1, "Company name is required"),
});

// GET — List all client organizations with onboarding status
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Only show client orgs, not admin's own
    const adminOrgId = user.orgId as string | undefined;
    const organizations = await prisma.organization.findMany({
      where: adminOrgId
        ? { id: { not: adminOrgId } }
        : { slug: { not: "nexflow" } },
      orderBy: { createdAt: "desc" },
      include: {
        integrations: {
          select: { type: true, status: true },
        },
        clientOnboardings: {
          select: {
            id: true,
            email: true,
            clientName: true,
            status: true,
            expiresAt: true,
            completedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: { reports: true },
        },
      },
    });

    const clients = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      createdAt: org.createdAt.toISOString(),
      integrations: org.integrations.map((i) => ({
        type: i.type,
        status: i.status,
      })),
      onboarding: org.clientOnboardings[0]
        ? {
            id: org.clientOnboardings[0].id,
            email: org.clientOnboardings[0].email,
            clientName: org.clientOnboardings[0].clientName,
            status: org.clientOnboardings[0].status,
            expiresAt: org.clientOnboardings[0].expiresAt.toISOString(),
            completedAt: org.clientOnboardings[0].completedAt?.toISOString() ?? null,
            createdAt: org.clientOnboardings[0].createdAt.toISOString(),
          }
        : null,
      reportCount: org._count.reports,
    }));

    return NextResponse.json(clients);
  } catch (error) {
    console.error("[NexFlow] Failed to list clients:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — Create a new client organization and send onboarding email
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
    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, companyName } = parsed.data;

    // Generate a URL-safe slug from the company name
    const baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slugSuffix = crypto.randomBytes(3).toString("hex");
    const slug = `${baseSlug}-${slugSuffix}`;

    // Create or find the organization
    const organization = await prisma.organization.create({
      data: {
        name: companyName,
        slug,
        plan: "starter",
      },
    });

    // Generate onboarding token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create onboarding record
    const onboarding = await prisma.clientOnboarding.create({
      data: {
        orgId: organization.id,
        token,
        email,
        clientName: name,
        status: "PENDING",
        expiresAt,
      },
    });

    // Send onboarding email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const setupUrl = `${baseUrl}/setup/${token}`;

    try {
      await sendOnboardingEmail({
        to: email,
        clientName: name,
        companyName,
        setupUrl,
      });
    } catch (emailError) {
      console.error("[NexFlow] Failed to send onboarding email:", emailError);
      // Continue even if email fails — admin can resend
    }

    return NextResponse.json(
      {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        onboarding: {
          id: onboarding.id,
          token: onboarding.token,
          email: onboarding.email,
          setupUrl,
          expiresAt: onboarding.expiresAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[NexFlow] Failed to create client:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
