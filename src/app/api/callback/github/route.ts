import { NextRequest, NextResponse } from "next/server";
import { exchangeGithubCode } from "@/lib/integrations/github/oauth";
import prisma from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // orgId
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/setup/connected?error=Missing+authorization+code`);
  }

  try {
    const tokenData = await exchangeGithubCode(code);

    await prisma.integration.upsert({
      where: { orgId_type: { orgId: state, type: "GITHUB" } },
      update: {
        accessToken: tokenData.access_token,
        status: "CONNECTED",
        config: { scope: tokenData.scope },
      },
      create: {
        orgId: state,
        type: "GITHUB",
        status: "CONNECTED",
        accessToken: tokenData.access_token,
        config: { scope: tokenData.scope },
      },
    });

    // Check if this came from an onboarding flow — find the onboarding token
    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { orgId: state, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    // Redirect to repo selection page so user can pick which repos to analyze
    const returnTo = onboarding
      ? `/setup/${onboarding.token}`
      : `/setup/connected?service=GitHub`;

    return NextResponse.redirect(
      `${baseUrl}/setup/github-repos?orgId=${state}&returnTo=${encodeURIComponent(returnTo)}`
    );
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);
    return NextResponse.redirect(`${baseUrl}/setup/connected?error=Failed+to+connect+GitHub`);
  }
}
