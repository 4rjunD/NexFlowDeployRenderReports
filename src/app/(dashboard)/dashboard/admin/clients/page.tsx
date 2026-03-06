import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ClientsListClient } from "./_components/clients-list-client"

export default async function AdminClientsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as any
  if (user.role !== "ADMIN") redirect("/dashboard")

  // Only show client orgs — exclude the admin's own org
  // Use slug "nexflow" as fallback in case orgId isn't in JWT
  const adminOrgId = user.orgId as string | undefined
  const organizations = await prisma.organization.findMany({
    where: adminOrgId
      ? { id: { not: adminOrgId } }
      : { slug: { not: "nexflow" } },
    orderBy: { createdAt: "desc" },
    include: {
      integrations: {
        select: { type: true, status: true },
      },
      clientOnboardings: {
        select: {
          id: true,
          email: true,
          clientName: true,
          status: true,
          expiresAt: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { reports: true },
      },
    },
  })

  const clients = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    createdAt: org.createdAt.toISOString(),
    integrations: org.integrations.map((i) => ({
      type: i.type,
      status: i.status,
    })),
    onboarding: org.clientOnboardings[0]
      ? {
          id: org.clientOnboardings[0].id,
          email: org.clientOnboardings[0].email,
          clientName: org.clientOnboardings[0].clientName,
          status: org.clientOnboardings[0].status,
          expiresAt: org.clientOnboardings[0].expiresAt.toISOString(),
          completedAt: org.clientOnboardings[0].completedAt?.toISOString() ?? null,
          createdAt: org.clientOnboardings[0].createdAt.toISOString(),
        }
      : null,
    reportCount: org._count.reports,
  }))

  return <ClientsListClient clients={clients} />
}
