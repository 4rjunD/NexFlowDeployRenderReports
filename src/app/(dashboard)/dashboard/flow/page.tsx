import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { subDays } from "date-fns"
import { FlowClient } from "./_components/flow-client"

export default async function FlowPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const orgId = (session.user as any).orgId as string | undefined
  if (!orgId) redirect("/login")

  const thirtyDaysAgo = subDays(new Date(), 30)

  // Fetch flow signals
  const flowSignals = await prisma.signal.findMany({
    where: {
      orgId,
      category: "flow",
    },
    orderBy: { computedAt: "desc" },
    take: 20,
  })

  // Fetch events from last 30 days for cycle time computation
  const recentEvents = await prisma.event.findMany({
    where: {
      orgId,
      timestamp: { gte: thirtyDaysAgo },
    },
    orderBy: { timestamp: "desc" },
    take: 500,
  })

  // Fetch PR events for pipeline analysis
  const prEvents = await prisma.event.findMany({
    where: {
      orgId,
      source: "GITHUB",
      timestamp: { gte: thirtyDaysAgo },
    },
    orderBy: { timestamp: "desc" },
    take: 200,
  })

  // Serialize dates for client component
  const serializedFlowSignals = flowSignals.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    value: s.value,
    weight: s.weight,
    trend: s.trend,
    metadata: s.metadata,
    computedAt: s.computedAt.toISOString(),
  }))

  const serializedEvents = recentEvents.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    source: e.source,
    metadata: e.metadata,
    timestamp: e.timestamp.toISOString(),
  }))

  const serializedPrEvents = prEvents.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    source: e.source,
    metadata: e.metadata,
    timestamp: e.timestamp.toISOString(),
  }))

  return (
    <FlowClient
      flowSignals={serializedFlowSignals}
      recentEvents={serializedEvents}
      prEvents={serializedPrEvents}
    />
  )
}
