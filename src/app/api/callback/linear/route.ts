import { NextRequest, NextResponse } from "next/server";
import { exchangeLinearCode } from "@/lib/integrations/linear/oauth";
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
    const tokenData = await exchangeLinearCode(code);
    const encryptedToken = encryptToken(tokenData.access_token);
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await prisma.integration.upsert({
      where: { orgId_type: { orgId: state, type: "LINEAR" } },
      update: {
        accessToken: encryptedToken,
        status: "CONNECTED",
        expiresAt,
        config: { scope: tokenData.scope },
      },
      create: {
        orgId: state,
        type: "LINEAR",
        status: "CONNECTED",
        accessToken: encryptedToken,
        expiresAt,
        config: { scope: tokenData.scope },
      },
    });

    return NextResponse.redirect(`${baseUrl}/setup/connected?service=Linear`);
  } catch (error) {
    console.error("Linear OAuth callback error:", error);
    return NextResponse.redirect(`${baseUrl}/setup/connected?error=Failed+to+connect+Linear`);
  }
}
