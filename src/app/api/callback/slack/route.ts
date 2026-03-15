import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db/prisma"
import { exchangeSlackCode } from "@/lib/integrations/slack/oauth"
import { encryptToken } from "@/lib/crypto"

/**
 * GET /api/callback/slack
 *
 * Slack OAuth callback handler. Exchanges the authorization code for
 * an access token and upserts the Integration record for the org.
 *
 * This route MUST live at /api/callback/slack to match the redirect URL
 * configured in the Slack app.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state") // orgId
  const error = searchParams.get("error")

  // Handle user-denied or Slack-side errors
  if (error) {
    console.error("Slack OAuth denied:", error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/setup/connected?error=Failed+to+connect+Slack&message=${encodeURIComponent(error)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/setup/connected?error=Failed+to+connect+Slack&message=${encodeURIComponent(
        "Missing authorization code or state"
      )}`
    )
  }

  const orgId = state

  try {
    // Verify the org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!org) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/setup/connected?error=Failed+to+connect+Slack&message=${encodeURIComponent(
          "Organization not found"
        )}`
      )
    }

    // Exchange code for token
    const tokenData = await exchangeSlackCode(code)
    const encryptedToken = encryptToken(tokenData.access_token)

    // Upsert the integration record
    await prisma.integration.upsert({
      where: {
        orgId_type: {
          orgId,
          type: "SLACK",
        },
      },
      update: {
        accessToken: encryptedToken,
        status: "CONNECTED",
        config: {
          teamId: tokenData.team.id,
          teamName: tokenData.team.name,
          botUserId: tokenData.bot_user_id,
          authedUserId: tokenData.authed_user.id,
          scope: tokenData.scope,
        },
      },
      create: {
        orgId,
        type: "SLACK",
        status: "CONNECTED",
        accessToken: encryptedToken,
        config: {
          teamId: tokenData.team.id,
          teamName: tokenData.team.name,
          botUserId: tokenData.bot_user_id,
          authedUserId: tokenData.authed_user.id,
          scope: tokenData.scope,
        },
      },
    })

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/setup/connected?service=Slack`
    )
  } catch (err) {
    console.error("Slack OAuth callback error:", err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/setup/connected?error=Failed+to+connect+Slack&message=${encodeURIComponent(
        "Failed to connect Slack"
      )}`
    )
  }
}
