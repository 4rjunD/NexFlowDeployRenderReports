import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { ReportsListClient } from "./_components/reports-list-client"

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const orgId = (session.user as any).orgId as string | undefined
  if (!orgId) redirect("/login")

  // Show ALL reports across all client orgs
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      team: { select: { name: true } },
      organization: { select: { name: true } },
    },
  })

  const serializedReports = reports.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    summary: r.summary,
    status: r.status,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    generatedAt: r.generatedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    teamName: r.team?.name ?? null,
    orgName: r.organization?.name ?? null,
  }))

  return <ReportsListClient reports={serializedReports} />
}
