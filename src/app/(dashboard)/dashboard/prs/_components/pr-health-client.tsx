"use client"

import {
  Clock,
  RotateCcw,
  CheckCircle,
  Scale,
  GitPullRequest,
} from "lucide-react"
import { MetricCard } from "@/components/dashboard/metric-card"
import { BarChart } from "@/components/charts/bar-chart"
import { AreaChart } from "@/components/charts/area-chart"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PRMetrics {
  avgPickupTime: number
  avgReviewCycle: number
  firstPassRate: number
  loadBalance: number
}

interface PipelinePR {
  id: string
  externalId: string
  title: string
  author: string | null
  authorImage: string | null
  status: string
  timestamp: string
}

interface PipelineData {
  columns: string[]
  prs: PipelinePR[]
}

interface PRHealthClientProps {
  metrics: PRMetrics
  pipeline: PipelineData
  reviewerLoadData: { name: string; reviews: number }[]
  reviewTimeDistribution: { range: string; count: number }[]
}

const columnColors: Record<string, string> = {
  Draft: "border-t-slate-400",
  "Review Requested": "border-t-blue-500",
  "Changes Requested": "border-t-amber-500",
  Approved: "border-t-emerald-500",
  Merged: "border-t-purple-500",
}

const columnBadgeColors: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  "Review Requested": "bg-blue-100 text-blue-700",
  "Changes Requested": "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Merged: "bg-purple-100 text-purple-700",
}

export function PRHealthClient({
  metrics,
  pipeline,
  reviewerLoadData,
  reviewTimeDistribution,
}: PRHealthClientProps) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Avg Pickup Time"
          value={`${metrics.avgPickupTime}h`}
          icon={<Clock className="h-5 w-5" />}
          description="time to first review"
        />
        <MetricCard
          title="Avg Review Cycle"
          value={`${metrics.avgReviewCycle}h`}
          icon={<RotateCcw className="h-5 w-5" />}
          description="open to merge"
        />
        <MetricCard
          title="First Pass Approval"
          value={`${metrics.firstPassRate}%`}
          icon={<CheckCircle className="h-5 w-5" />}
          description="approved on first review"
        />
        <MetricCard
          title="Reviewer Load Balance"
          value={`${metrics.loadBalance}%`}
          icon={<Scale className="h-5 w-5" />}
          description="distribution evenness"
        />
      </div>

      {/* PR Pipeline (Kanban Board) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitPullRequest className="h-5 w-5 text-muted-foreground" />
            PR Pipeline
          </CardTitle>
          <CardDescription>
            Pull requests grouped by current status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {pipeline.columns.map((column) => {
              const columnPRs = pipeline.prs.filter(
                (pr) => pr.status === column
              )
              return (
                <div
                  key={column}
                  className={cn(
                    "rounded-lg border border-t-4 bg-muted/30 p-3",
                    columnColors[column] ?? "border-t-gray-400"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {column}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        columnBadgeColors[column] ?? ""
                      )}
                    >
                      {columnPRs.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {columnPRs.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No PRs
                      </p>
                    ) : (
                      columnPRs.slice(0, 5).map((pr) => (
                        <div
                          key={pr.id}
                          className="rounded-md border bg-background p-2.5 shadow-sm"
                        >
                          <p className="mb-1 line-clamp-2 text-xs font-medium leading-snug">
                            {pr.title}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {pr.author ?? "Unknown"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(pr.timestamp).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" }
                              )}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                    {columnPRs.length > 5 && (
                      <p className="text-center text-xs text-muted-foreground">
                        +{columnPRs.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Two-column charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Reviewer Load */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reviewer Load</CardTitle>
            <CardDescription>
              Number of reviews per team member
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviewerLoadData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No review data available.
              </p>
            ) : (
              <BarChart
                data={reviewerLoadData}
                categories={["reviews"]}
                index="name"
                layout="vertical"
                height={Math.max(200, reviewerLoadData.length * 40)}
              />
            )}
          </CardContent>
        </Card>

        {/* Review Time Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Time Distribution</CardTitle>
            <CardDescription>
              How long PRs take from open to merge
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={reviewTimeDistribution}
              categories={["count"]}
              index="range"
              height={300}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
