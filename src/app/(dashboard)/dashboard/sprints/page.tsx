import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { SprintRiskClient } from "./_components/sprint-risk-client"

export default async function SprintsPage() {
  const session = await auth()
  const orgId = (session?.user as any)?.orgId

  // Fetch all data in parallel
  const [activeSprint, allSprints] = await Promise.all([
    // Active sprint (most recent one)
    prisma.sprint.findFirst({
      where: {
        ...(orgId ? { orgId } : {}),
        status: "ACTIVE",
      },
      include: { team: { select: { name: true } } },
      orderBy: { startDate: "desc" },
    }),

    // All sprints for trend data
    prisma.sprint.findMany({
      where: orgId ? { orgId } : {},
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        riskScore: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    }),
  ])

  // Fetch signals for the active sprint (if found)
  const sprintSignals = activeSprint
    ? await prisma.signal.findMany({
        where: {
          ...(orgId ? { orgId } : {}),
          sprintId: activeSprint.id,
          category: "sprint_risk",
        },
        orderBy: { weight: "desc" },
      })
    : []

  // Serialize sprint data
  const serializedActiveSprint = activeSprint
    ? {
        id: activeSprint.id,
        name: activeSprint.name,
        goal: activeSprint.goal,
        status: activeSprint.status,
        riskScore: activeSprint.riskScore,
        startDate: activeSprint.startDate.toISOString(),
        endDate: activeSprint.endDate.toISOString(),
        teamName: activeSprint.team.name,
      }
    : null

  // Compute sprint progress (based on time elapsed)
  let sprintProgress = 0
  if (activeSprint) {
    const now = new Date()
    const start = activeSprint.startDate.getTime()
    const end = activeSprint.endDate.getTime()
    const elapsed = now.getTime() - start
    const total = end - start
    sprintProgress = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0
  }

  // Serialize signals
  const serializedSignals = sprintSignals.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    value: s.value,
    weight: s.weight,
    trend: s.trend,
    metadata: s.metadata as Record<string, any>,
    computedAt: s.computedAt.toISOString(),
  }))

  // Risk trend data from all sprints
  const riskTrendData = allSprints.map((s) => ({
    sprint: s.name.length > 12 ? s.name.substring(0, 12) + "..." : s.name,
    riskScore: Math.round(s.riskScore * 10) / 10,
  }))

  return (
    <SprintRiskClient
      activeSprint={serializedActiveSprint}
      sprintProgress={sprintProgress}
      signals={serializedSignals}
      riskTrendData={riskTrendData}
    />
  )
}
