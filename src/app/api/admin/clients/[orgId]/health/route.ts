import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestResult = { ok: boolean; message: string; sampleData?: any };

async function testSlack(accessToken: string): Promise<TestResult> {
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, message: data.error || "Auth failed" };

    // Try fetching recent channels
    const chRes = await fetch("https://slack.com/api/conversations.list?limit=3&types=public_channel", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const chData = await chRes.json();
    const channels = chData.channels?.map((c: any) => c.name) || [];

    return {
      ok: true,
      message: `Connected as ${data.team}`,
      sampleData: { team: data.team, user: data.user, channels },
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function testGithub(accessToken: string): Promise<TestResult> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return { ok: false, message: `GitHub API error: ${res.status}` };
    const user = await res.json();

    const reposRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=5", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    const repos = await reposRes.json();
    const repoNames = Array.isArray(repos) ? repos.map((r: any) => r.full_name) : [];

    return {
      ok: true,
      message: `Connected as ${user.login}`,
      sampleData: { login: user.login, repos: repoNames },
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function testLinear(accessToken: string): Promise<TestResult> {
  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ viewer { name email } organization { name } teams(first: 5) { nodes { name } } }`,
      }),
    });
    const data = await res.json();
    if (data.errors) return { ok: false, message: data.errors[0]?.message || "GraphQL error" };

    return {
      ok: true,
      message: `Connected to ${data.data.organization.name}`,
      sampleData: {
        org: data.data.organization.name,
        user: data.data.viewer.name,
        teams: data.data.teams.nodes.map((t: any) => t.name),
      },
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function testGoogleCalendar(accessToken: string): Promise<TestResult> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=3&orderBy=startTime&singleEvents=true&timeMin=" +
        new Date().toISOString(),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return { ok: false, message: `Calendar API error: ${res.status}` };
    const data = await res.json();
    const events = (data.items || []).map((e: any) => e.summary || "Untitled");

    return {
      ok: true,
      message: `Calendar connected`,
      sampleData: { upcomingEvents: events, calendarId: data.summary || "primary" },
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { orgId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const integrations = await prisma.integration.findMany({
      where: { orgId: params.orgId },
    });

    const results: Record<string, TestResult & { type: string; status: string; connectedAt?: string }> = {};

    const tests = integrations.map(async (integration) => {
      const token = integration.accessToken || "";
      let test: TestResult;

      switch (integration.type) {
        case "SLACK":
          test = await testSlack(token);
          break;
        case "GITHUB":
          test = await testGithub(token);
          break;
        case "LINEAR":
          test = await testLinear(token);
          break;
        case "GOOGLE_CALENDAR":
          test = await testGoogleCalendar(token);
          break;
        default:
          test = { ok: false, message: "Unknown integration type" };
      }

      results[integration.type] = {
        ...test,
        type: integration.type,
        status: integration.status,
        connectedAt: integration.createdAt.toISOString(),
      };
    });

    await Promise.allSettled(tests);

    // Add missing integrations
    for (const type of ["GITHUB", "SLACK", "LINEAR", "GOOGLE_CALENDAR"]) {
      if (!results[type]) {
        results[type] = {
          ok: false,
          message: "Not connected",
          type,
          status: "DISCONNECTED",
        };
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[NexFlow] Health check failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
