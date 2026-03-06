import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SettingsClient } from "./_components/settings-client"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const orgId = (session.user as any).orgId as string | undefined
  if (!orgId) redirect("/login")

  // Fetch all integrations for the org
  const integrations = await prisma.integration.findMany({
    where: { orgId },
  })

  // Fetch the current user with full details
  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    include: {
      organization: { select: { id: true, name: true, slug: true, plan: true } },
      deliveryPreferences: true,
    },
  })

  // Fetch org members for the Team tab
  const orgMembers = await prisma.user.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      image: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const serializedIntegrations = integrations.map((i) => ({
    id: i.id,
    type: i.type,
    status: i.status,
    updatedAt: i.updatedAt.toISOString(),
  }))

  const serializedUser = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        organization: user.organization
          ? {
              id: user.organization.id,
              name: user.organization.name,
              slug: user.organization.slug,
              plan: user.organization.plan,
            }
          : null,
        deliveryPreferences: user.deliveryPreferences.map((dp) => ({
          id: dp.id,
          reportType: dp.reportType,
          channel: dp.channel,
          enabled: dp.enabled,
        })),
      }
    : null

  const serializedMembers = orgMembers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    image: m.image,
    createdAt: m.createdAt.toISOString(),
  }))

  return (
    <SettingsClient
      integrations={serializedIntegrations}
      user={serializedUser}
      members={serializedMembers}
    />
  )
}
