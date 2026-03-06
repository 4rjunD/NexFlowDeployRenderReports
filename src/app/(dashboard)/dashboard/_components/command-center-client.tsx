"use client"

import {
  GitPullRequest,
  GitMerge,
  CheckCircle,
  GitCommit,
  Activity,
  FileText,
  AlertTriangle,
} from "lucide-react"
import { MetricCard } from "@/components/dashboard/metric-card"
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

interface Metrics {
  openPRs: number
  mergedPRs: number
  completedTickets: number
  totalCommits: number
}

interface SerializedEvent {
  id: string
  type: string
  title: string
  source: string
  timestamp: string
  user: { name: string | null; image: string | null } | null
}

interface SerializedSprint {
  id: string
  name: string
  riskScore: number
  status: string
  startDate: string
  endDate: string
  teamName: string
}

interface SerializedReport {
  id: string
  title: string
  type: string
  status: string
  createdAt: string
  teamName: string | null
}

interface CommandCenterClientProps {
  metrics: Metrics
  activityTimeline: { date: string; events: number }[]
  recentEvents: SerializedEvent[]
  activeSprints: SerializedSprint[]
  recentReports: SerializedReport[]
}

function getRiskColor(score: number) {
  if (score >= 75) return "bg-red-500/15 text-red-700 border-red-200"
  if (score >= 50) return "bg-amber-500/15 text-amber-700 border-amber-200"
  if (score >= 25) return "bg-yellow-500/15 text-yellow-700 border-yellow-200"
  return "bg-emerald-500/15 text-emerald-700 border-emerald-200"
}

function getRiskLabel(score: number) {
  if (score >= 75) return "Critical"
  if (score >= 50) return "High"
  if (score >= 25) return "Medium"
  return "Low"
}

function getReportTypeBadgeVariant(type: string) {
  switch (type) {
    case "WEEKLY_DIGEST":
      return "default"
    case "SPRINT_RISK":
      return "destructive"
    case "MONTHLY_HEALTH":
      return "secondary"
    default:
      return "outline"
  }
}

function formatReportType(type: string) {
  return type
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ")
}

export function CommandCenterClient({
  metrics,
  activityTimeline,
  recentEvents,
  activeSprints,
  recentReports,
}: CommandCenterClientProps) {
  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Open PRs"
          value={metrics.openPRs}
          icon={<GitPullRequest className="h-5 w-5" />}
          trend={{ value: 12, direction: "up" }}
          description="last 7 days"
        />
        <MetricCard
          title="PRs Merged"
          value={metrics.mergedPRs}
          icon={<GitMerge className="h-5 w-5" />}
          description="last 7 days"
        />
        <MetricCard
          title="Tickets Completed"
          value={metrics.completedTickets}
          icon={<CheckCircle className="h-5 w-5" />}
          description="last 7 days"
        />
        <MetricCard
          title="Commits"
          value={metrics.totalCommits}
          icon={<GitCommit className="h-5 w-5" />}
          description="last 7 days"
        />
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Activity Timeline
          </CardTitle>
          <CardDescription>Events per day over the last 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaChart
            data={activityTimeline}
            categories={["events"]}
            index="date"
            height={280}
          />
        </CardContent>
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sprint Risk Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              Sprint Risk Overview
            </CardTitle>
            <CardDescription>
              Active sprints sorted by risk score
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeSprints.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active sprints found.
              </p>
            ) : (
              <div className="space-y-3">
                {activeSprints.map((sprint) => (
                  <div
                    key={sprint.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{sprint.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sprint.teamName}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "font-mono text-xs",
                        getRiskColor(sprint.riskScore)
                      )}
                      variant="outline"
                    >
                      {getRiskLabel(sprint.riskScore)} ({Math.round(sprint.riskScore)})
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Recent Reports
            </CardTitle>
            <CardDescription>
              Latest generated reports
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reports generated yet.
              </p>
            ) : (
              <div className="space-y-3">
                {recentReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{report.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.teamName && `${report.teamName} -- `}
                        {new Date(report.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={
                        getReportTypeBadgeVariant(report.type) as
                          | "default"
                          | "secondary"
                          | "destructive"
                          | "outline"
                      }
                    >
                      {formatReportType(report.type)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
