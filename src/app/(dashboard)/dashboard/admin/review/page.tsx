import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { AdminReviewClient } from "./_components/admin-review-client"

export default async function AdminReviewPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as any
  if (user.role !== "ADMIN") redirect("/dashboard")

  const orgId = user.orgId as string | undefined
  if (!orgId) redirect("/login")

  // Show ALL reports across all client orgs (admin sees everything)
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      team: { select: { name: true } },
      organization: { select: { name: true } },
      reviewedBy: { select: { name: true, email: true } },
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
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByName: r.reviewedBy?.name ?? null,
    reviewNotes: r.reviewNotes,
  }))

  return <AdminReviewClient reports={serializedReports} />
}
