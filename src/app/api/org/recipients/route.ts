import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

const VALID_ROLES = ["CTO", "VP_ENG", "ENG_DIRECTOR", "TEAM_LEAD", "ENGINEERING_MANAGER", "IC", "STAKEHOLDER"] as const;
const VALID_DEPTHS = ["EXECUTIVE", "STANDARD", "FULL"] as const;

const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(VALID_ROLES).default("TEAM_LEAD"),
  reportDepth: z.enum(VALID_DEPTHS).default("FULL"),
  channels: z.array(z.enum(["EMAIL", "SLACK"])).default(["EMAIL"]),
  slackUserId: z.string().optional(),
  active: z.boolean().default(true),
});

const bulkSchema = z.object({
  orgId: z.string(),
  recipients: z.array(recipientSchema).min(1).max(500),
});

const singleSchema = recipientSchema.extend({
  orgId: z.string(),
});

// GET — list recipients for an org
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const recipients = await prisma.reportRecipient.findMany({
    where: { orgId },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ recipients });
}

// POST — add recipient(s) to an org. Supports single or bulk.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json();

  // Bulk import
  if (Array.isArray(body.recipients)) {
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { orgId, recipients } = parsed.data;

    // Verify org exists
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    // Upsert each recipient (handles duplicates gracefully)
    const results: { email: string; status: "created" | "updated" | "error"; error?: string }[] = [];

    // Process in batches of 50 for DB connection safety
    const BATCH_SIZE = 50;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (r) => {
        try {
          const existing = await prisma.reportRecipient.findUnique({
            where: { orgId_email: { orgId, email: r.email } },
          });

          if (existing) {
            await prisma.reportRecipient.update({
              where: { id: existing.id },
              data: {
                name: r.name,
                role: r.role,
                reportDepth: r.reportDepth,
                channels: r.channels,
                slackUserId: r.slackUserId || null,
                active: r.active,
              },
            });
            results.push({ email: r.email, status: "updated" });
          } else {
            await prisma.reportRecipient.create({
              data: {
                orgId,
                email: r.email,
                name: r.name,
                role: r.role,
                reportDepth: r.reportDepth,
                channels: r.channels,
                slackUserId: r.slackUserId || null,
                active: r.active,
              },
            });
            results.push({ email: r.email, status: "created" });
          }
        } catch (err) {
          results.push({ email: r.email, status: "error", error: err instanceof Error ? err.message : "Unknown" });
        }
      });
      await Promise.all(batchPromises);
    }

    const created = results.filter((r) => r.status === "created").length;
    const updated = results.filter((r) => r.status === "updated").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: true,
      message: `${created} created, ${updated} updated, ${errors} errors`,
      total: recipients.length,
      created,
      updated,
      errors,
      results,
    });
  }

  // Single recipient
  const parsed = singleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { orgId, ...data } = parsed.data;

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const recipient = await prisma.reportRecipient.upsert({
    where: { orgId_email: { orgId, email: data.email } },
    update: {
      name: data.name,
      role: data.role,
      reportDepth: data.reportDepth,
      channels: data.channels,
      slackUserId: data.slackUserId || null,
      active: data.active,
    },
    create: {
      orgId,
      email: data.email,
      name: data.name,
      role: data.role,
      reportDepth: data.reportDepth,
      channels: data.channels,
      slackUserId: data.slackUserId || null,
      active: data.active,
    },
  });

  return NextResponse.json({ recipient });
}

// PUT — update a specific recipient
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "Recipient id required" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (updates.name) updateData.name = updates.name;
  if (updates.email) updateData.email = updates.email;
  if (updates.role && VALID_ROLES.includes(updates.role)) updateData.role = updates.role;
  if (updates.reportDepth && VALID_DEPTHS.includes(updates.reportDepth)) updateData.reportDepth = updates.reportDepth;
  if (updates.channels) updateData.channels = updates.channels;
  if (updates.slackUserId !== undefined) updateData.slackUserId = updates.slackUserId || null;
  if (typeof updates.active === "boolean") updateData.active = updates.active;

  const recipient = await prisma.reportRecipient.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ recipient });
}

// DELETE — remove a recipient
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Recipient id required" }, { status: 400 });

  await prisma.reportRecipient.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
