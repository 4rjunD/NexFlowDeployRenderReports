import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/integrations/google/oauth";
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
    const tokenData = await exchangeGoogleCode(code);
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    await prisma.integration.upsert({
      where: { orgId_type: { orgId: state, type: "GOOGLE_CALENDAR" } },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || undefined,
        expiresAt,
        status: "CONNECTED",
        config: { scope: tokenData.scope },
      },
      create: {
        orgId: state,
        type: "GOOGLE_CALENDAR",
        status: "CONNECTED",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt,
        config: { scope: tokenData.scope },
      },
    });

    return NextResponse.redirect(`${baseUrl}/setup/connected?service=Google+Calendar`);
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(`${baseUrl}/setup/connected?error=Failed+to+connect+Google+Calendar`);
  }
}
