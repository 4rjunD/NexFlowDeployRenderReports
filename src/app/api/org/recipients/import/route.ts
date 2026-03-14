import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

const VALID_ROLES = ["CTO", "VP_ENG", "ENG_DIRECTOR", "TEAM_LEAD", "ENGINEERING_MANAGER", "IC", "STAKEHOLDER"];
const VALID_DEPTHS = ["EXECUTIVE", "STANDARD", "FULL"];

// ── Simple in-memory rate limiter ──
// Max 5 imports per org per 10 minutes
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const importHistory = new Map<string, number[]>();

function checkRateLimit(orgId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const history = importHistory.get(orgId) || [];
  // Remove entries outside window
  const recent = history.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  importHistory.set(orgId, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0];
    return { allowed: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - oldest) };
  }
  recent.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

// POST — import recipients from CSV text
// Expected CSV format: email,name,role,reportDepth
// First row is header (skipped)
// Rate limited: 5 imports per org per 10 minutes
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json();
  const { orgId, csv } = body as { orgId?: string; csv?: string };

  if (!orgId || !csv) {
    return NextResponse.json({ error: "orgId and csv are required" }, { status: 400 });
  }

  // Rate limit check
  const rateCheck = checkRateLimit(orgId);
  if (!rateCheck.allowed) {
    const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  // Cap CSV size at 1MB to prevent abuse
  if (csv.length > 1_000_000) {
    return NextResponse.json({ error: "CSV too large. Maximum 1MB." }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  // Parse CSV
  const lines = csv.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
  }

  // Skip header
  const dataLines = lines.slice(1);
  const results: { line: number; email: string; status: "created" | "updated" | "skipped"; error?: string }[] = [];

  const BATCH_SIZE = 50;
  for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
    const batch = dataLines.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (line, idx) => {
      const lineNum = i + idx + 2; // +2 for 1-indexed + header
      const parts = line.split(",").map((p: string) => p.trim().replace(/^["']|["']$/g, ""));
      const [email, name, roleRaw, depthRaw] = parts;

      if (!email || !email.includes("@")) {
        results.push({ line: lineNum, email: email || "", status: "skipped", error: "Invalid email" });
        return;
      }

      const role = VALID_ROLES.includes(roleRaw?.toUpperCase()) ? roleRaw.toUpperCase() : "TEAM_LEAD";
      const depth = VALID_DEPTHS.includes(depthRaw?.toUpperCase()) ? depthRaw.toUpperCase() : "FULL";
      const recipientName = name || email.split("@")[0];

      try {
        const existing = await prisma.reportRecipient.findUnique({
          where: { orgId_email: { orgId, email } },
        });

        if (existing) {
          await prisma.reportRecipient.update({
            where: { id: existing.id },
            data: { name: recipientName, role: role as any, reportDepth: depth as any, active: true },
          });
          results.push({ line: lineNum, email, status: "updated" });
        } else {
          await prisma.reportRecipient.create({
            data: {
              orgId,
              email,
              name: recipientName,
              role: role as any,
              reportDepth: depth as any,
              channels: ["EMAIL"],
              active: true,
            },
          });
          results.push({ line: lineNum, email, status: "created" });
        }
      } catch (err) {
        results.push({ line: lineNum, email, status: "skipped", error: err instanceof Error ? err.message : "Unknown" });
      }
    });
    await Promise.all(batchPromises);
  }

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return NextResponse.json({
    success: true,
    message: `${created} created, ${updated} updated, ${skipped} skipped`,
    total: dataLines.length,
    created,
    updated,
    skipped,
    results,
  });
}
