import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { ClientDetailClient } from "./_components/client-detail-client"

interface ClientDetailPageProps {
  params: { orgId: string }
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as any
  if (user.role !== "ADMIN") redirect("/dashboard")

  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
    include: {
      integrations: true,
      clientOnboardings: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      reports: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          createdAt: true,
          generatedAt: true,
        },
      },
      _count: {
        select: { reports: true },
      },
    },
  })

  if (!org) notFound()

  const serialized = {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    createdAt: org.createdAt.toISOString(),
    integrations: org.integrations.map((i) => ({
      type: i.type,
      status: i.status,
      connectedAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt?.toISOString() ?? null,
    })),
    onboarding: org.clientOnboardings[0]
      ? {
          email: org.clientOnboardings[0].email,
          clientName: org.clientOnboardings[0].clientName,
          status: org.clientOnboardings[0].status,
          expiresAt: org.clientOnboardings[0].expiresAt.toISOString(),
          completedAt: org.clientOnboardings[0].completedAt?.toISOString() ?? null,
        }
      : null,
    reports: org.reports.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      generatedAt: r.generatedAt?.toISOString() ?? null,
    })),
    reportCount: org._count.reports,
  }

  return <ClientDetailClient client={serialized} />
}
