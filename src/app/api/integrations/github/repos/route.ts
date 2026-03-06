// ─────────────────────────────────────────────────────────────
// GET /api/integrations/github/repos — List available GitHub repos for org
// POST /api/integrations/github/repos — Save selected repos
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { fetchRepos } from "@/lib/integrations/github/client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  const integration = await prisma.integration.findUnique({
    where: { orgId_type: { orgId, type: "GITHUB" } },
  });

  if (!integration?.accessToken) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 404 });
  }

  try {
    console.log(`[NexFlow] Fetching GitHub repos for org ${orgId}, token starts with: ${integration.accessToken.slice(0, 8)}...`);
    const repos = await fetchRepos(integration.accessToken);
    console.log(`[NexFlow] Found ${repos.length} GitHub repos`);
    const config = (integration.config as Record<string, unknown>) || {};
    const selectedRepos = (config.selectedRepos as string[]) || [];

    return NextResponse.json({
      repos: repos.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        name: r.name,
        owner: r.owner.login,
        private: r.private,
        language: r.language,
        description: r.description,
        pushedAt: r.pushed_at,
      })),
      selectedRepos,
    });
  } catch (error) {
    console.error("[NexFlow] Failed to fetch GitHub repos:", error);
    return NextResponse.json(
      { error: `Failed to fetch repositories: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { orgId, selectedRepos } = body;

  if (!orgId || !Array.isArray(selectedRepos)) {
    return NextResponse.json(
      { error: "orgId and selectedRepos[] required" },
      { status: 400 }
    );
  }

  const integration = await prisma.integration.findUnique({
    where: { orgId_type: { orgId, type: "GITHUB" } },
  });

  if (!integration) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 404 });
  }

  const existingConfig = (integration.config as Record<string, unknown>) || {};

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      config: { ...existingConfig, selectedRepos },
    },
  });

  return NextResponse.json({ success: true, selectedRepos });
}
