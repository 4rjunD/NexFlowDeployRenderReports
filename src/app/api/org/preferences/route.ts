import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

// GET — Fetch report preferences for an org
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { reportPreferences: true },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json(org.reportPreferences || {});
}

// POST — Save report preferences for an org
export async function POST(request: Request) {
  const body = await request.json();
  const { orgId, preferences } = body;

  if (!orgId || !preferences) {
    return NextResponse.json({ error: "orgId and preferences required" }, { status: 400 });
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { reportPreferences: preferences },
  });

  return NextResponse.json({ success: true });
}
