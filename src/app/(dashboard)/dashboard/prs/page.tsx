import prisma from "@/lib/db/prisma"
import { auth } from "@/lib/auth"
import { PRHealthClient } from "./_components/pr-health-client"

export default async function PRsPage() {
  const session = await auth()
  const orgId = (session?.user as any)?.orgId

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Fetch PR events and signals in parallel
  const [prEvents, prSignals] = await Promise.all([
    // All PR events from last 30 days
    prisma.event.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        type: { in: ["pr_opened", "pr_merged", "pr_review_submitted"] },
        timestamp: { gte: thirtyDaysAgo },
      },
      orderBy: { timestamp: "desc" },
      include: { user: { select: { name: true, image: true } } },
    }),

    // PR health signals
    prisma.signal.findMany({
      where: {
        ...(orgId ? { orgId } : {}),
        category: "pr_health",
      },
      orderBy: { computedAt: "desc" },
    }),
  ])

  // Compute summary metrics from events
  const prOpened = prEvents.filter((e) => e.type === "pr_opened")
  const prMerged = prEvents.filter((e) => e.type === "pr_merged")
  const prReviews = prEvents.filter((e) => e.type === "pr_review_submitted")

  // Compute average pickup time from metadata (hours)
  const pickupTimes = prReviews
    .map((e) => {
      const meta = e.metadata as Record<string, any>
      return meta?.pickupTimeHours ?? meta?.pickup_time_hours ?? null
    })
    .filter((t): t is number => t !== null)
  const avgPickupTime =
    pickupTimes.length > 0
      ? pickupTimes.reduce((a, b) => a + b, 0) / pickupTimes.length
      : 0

  // Compute average review cycle time from metadata (hours)
  const cycleTimes = prMerged
    .map((e) => {
      const meta = e.metadata as Record<string, any>
      return meta?.reviewCycleHours ?? meta?.review_cycle_hours ?? null
    })
    .filter((t): t is number => t !== null)
  const avgReviewCycle =
    cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : 0

  // First pass approval rate
  const approvals = prReviews.filter((e) => {
    const meta = e.metadata as Record<string, any>
    return meta?.state === "approved" || meta?.action === "approved"
  })
  const firstPassRate =
    prReviews.length > 0
      ? Math.round((approvals.length / prReviews.length) * 100)
      : 0

  // Reviewer load: count reviews per reviewer
  const reviewerCounts: Record<string, number> = {}
  for (const review of prReviews) {
    const reviewer = review.user?.name ?? "Unknown"
    reviewerCounts[reviewer] = (reviewerCounts[reviewer] || 0) + 1
  }
  const reviewerLoadData = Object.entries(reviewerCounts)
    .map(([name, reviews]) => ({ name, reviews }))
    .sort((a, b) => b.reviews - a.reviews)

  // Reviewer load balance (std dev / mean -- lower is more balanced)
  const reviewValues = Object.values(reviewerCounts)
  const mean =
    reviewValues.length > 0
      ? reviewValues.reduce((a, b) => a + b, 0) / reviewValues.length
      : 0
  const variance =
    reviewValues.length > 0
      ? reviewValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
        reviewValues.length
      : 0
  const loadBalance = mean > 0 ? Math.round((1 - Math.sqrt(variance) / mean) * 100) : 100

  // Build PR pipeline from events
  // Derive PR statuses from event types
  const prMap: Record<
    string,
    {
      id: string
      externalId: string
      title: string
      author: string | null
      authorImage: string | null
      status: string
      timestamp: string
    }
  > = {}

  // Process events chronologically to build current state
  const sortedEvents = [...prEvents].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  )

  for (const event of sortedEvents) {
    const meta = event.metadata as Record<string, any>
    const prId = event.externalId
    const existing = prMap[prId]

    if (event.type === "pr_opened") {
      const prStatus = meta?.draft ? "Draft" : "Review Requested"
      prMap[prId] = {
        id: event.id,
        externalId: prId,
        title: event.title,
        author: event.user?.name ?? null,
        authorImage: event.user?.image ?? null,
        status: prStatus,
        timestamp: event.timestamp.toISOString(),
      }
    } else if (event.type === "pr_review_submitted") {
      if (existing) {
        const state = meta?.state ?? meta?.action ?? ""
        if (state === "changes_requested") {
          existing.status = "Changes Requested"
        } else if (state === "approved") {
          existing.status = "Approved"
        }
        existing.timestamp = event.timestamp.toISOString()
      }
    } else if (event.type === "pr_merged") {
      if (existing) {
        existing.status = "Merged"
        existing.timestamp = event.timestamp.toISOString()
      } else {
        prMap[prId] = {
          id: event.id,
          externalId: prId,
          title: event.title,
          author: event.user?.name ?? null,
          authorImage: event.user?.image ?? null,
          status: "Merged",
          timestamp: event.timestamp.toISOString(),
        }
      }
    }
  }

  const pipelineData = Object.values(prMap)
  const pipelineColumns = [
    "Draft",
    "Review Requested",
    "Changes Requested",
    "Approved",
    "Merged",
  ]

  // Review time distribution (group review cycle times into buckets)
  const timeBuckets = [
    { label: "<1h", min: 0, max: 1 },
    { label: "1-4h", min: 1, max: 4 },
    { label: "4-8h", min: 4, max: 8 },
    { label: "8-24h", min: 8, max: 24 },
    { label: "1-2d", min: 24, max: 48 },
    { label: "2-5d", min: 48, max: 120 },
    { label: ">5d", min: 120, max: Infinity },
  ]

  const allCycleTimes = prMerged.map((e) => {
    const meta = e.metadata as Record<string, any>
    return meta?.reviewCycleHours ?? meta?.review_cycle_hours ?? 0
  })

  const reviewTimeDistribution = timeBuckets.map((bucket) => ({
    range: bucket.label,
    count: allCycleTimes.filter(
      (t: number) => t >= bucket.min && t < bucket.max
    ).length,
  }))

  return (
    <PRHealthClient
      metrics={{
        avgPickupTime: Math.round(avgPickupTime * 10) / 10,
        avgReviewCycle: Math.round(avgReviewCycle * 10) / 10,
        firstPassRate,
        loadBalance: Math.max(0, Math.min(100, loadBalance)),
      }}
      pipeline={{
        columns: pipelineColumns,
        prs: pipelineData,
      }}
      reviewerLoadData={reviewerLoadData}
      reviewTimeDistribution={reviewTimeDistribution}
    />
  )
}
