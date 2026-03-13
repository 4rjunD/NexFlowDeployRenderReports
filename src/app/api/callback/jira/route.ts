import { NextRequest, NextResponse } from "next/server";
import { exchangeJiraCode } from "@/lib/integrations/jira/oauth";
import { encryptToken } from "@/lib/crypto";
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
    const tokenData = await exchangeJiraCode(code);
    const encryptedAccess = encryptToken(tokenData.access_token);
    const encryptedRefresh = tokenData.refresh_token
      ? encryptToken(tokenData.refresh_token)
      : null;

    await prisma.integration.upsert({
      where: { orgId_type: { orgId: state, type: "JIRA" } },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        status: "CONNECTED",
        config: { scope: tokenData.scope },
      },
      create: {
        orgId: state,
        type: "JIRA",
        status: "CONNECTED",
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        config: { scope: tokenData.scope },
      },
    });

    // Redirect back to onboarding if applicable
    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { orgId: state, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    const returnTo = onboarding
      ? `/setup/${onboarding.token}`
      : `/setup/connected?service=Jira`;

    return NextResponse.redirect(`${baseUrl}${returnTo}`);
  } catch (error) {
    console.error("Jira OAuth callback error:", error);
    return NextResponse.redirect(`${baseUrl}/setup/connected?error=Failed+to+connect+Jira`);
  }
}
