import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/db/prisma"

/**
 * GET /api/integrations/slack/status
 *
 * Returns the current Slack integration status for the authenticated
 * user's organization.
 */
export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = (session.user as any).orgId as string | undefined

  if (!orgId) {
    return NextResponse.json(
      { error: "No organization associated with this user" },
      { status: 400 }
    )
  }

  const integration = await prisma.integration.findUnique({
    where: {
      orgId_type: {
        orgId,
        type: "SLACK",
      },
    },
    select: {
      id: true,
      status: true,
      config: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!integration) {
    return NextResponse.json({
      connected: false,
      status: "DISCONNECTED",
    })
  }

  return NextResponse.json({
    connected: integration.status === "CONNECTED",
    status: integration.status,
    config: integration.config,
    connectedAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  })
}
