import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { WeeklyDigestView } from "../_components/weekly-digest-view"
import { SprintRiskView } from "../_components/sprint-risk-view"
import { MonthlyHealthView } from "../_components/monthly-health-view"

interface ReportDetailPageProps {
  params: { reportId: string }
}

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const report = await prisma.report.findUnique({
    where: { id: params.reportId },
    include: {
      deliveries: {
        include: {
          recipient: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      team: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  })

  if (!report) notFound()

  // Verify access: admin can see all, others only their own org
  const user = session.user as any
  const orgId = user.orgId as string | undefined
  const userRole = user.role as string | undefined
  if (userRole !== "ADMIN" && report.orgId !== orgId) notFound()

  // Serialize the report data for client components
  const serializedReport = {
    id: report.id,
    type: report.type,
    title: report.title,
    summary: report.summary,
    content: report.content as Record<string, any>,
    aiNarrative: report.aiNarrative,
    status: report.status,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    generatedAt: report.generatedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    teamName: report.team?.name ?? null,
    reviewedAt: report.reviewedAt?.toISOString() ?? null,
    reviewedByName: report.reviewedBy?.name ?? null,
    reviewNotes: report.reviewNotes,
    deliveries: report.deliveries.map((d) => ({
      id: d.id,
      channel: d.channel,
      status: d.status,
      sentAt: d.sentAt?.toISOString() ?? null,
      recipientName: d.recipient?.name ?? null,
      recipientEmail: d.recipient?.email ?? d.recipientEmail ?? null,
    })),
  }

  switch (report.type) {
    case "WEEKLY_DIGEST":
      return <WeeklyDigestView report={serializedReport} userRole={userRole} />
    case "SPRINT_RISK":
      return <SprintRiskView report={serializedReport} userRole={userRole} />
    case "MONTHLY_HEALTH":
      return <MonthlyHealthView report={serializedReport} userRole={userRole} />
    default:
      return <WeeklyDigestView report={serializedReport} userRole={userRole} />
  }
}
