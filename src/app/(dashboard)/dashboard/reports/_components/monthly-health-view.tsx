"use client"

import React from "react"
import Link from "next/link"
import { format } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ReviewStatusBanner } from "@/components/dashboard/review-status-banner"
import { ReportActions } from "@/components/dashboard/report-actions"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Delivery {
  id: string
  channel: string
  status: string
  sentAt: string | null
  recipientName: string | null
  recipientEmail: string | null
}

interface ReportData {
  id: string
  type: string
  title: string
  summary: string | null
  content: Record<string, any>
  aiNarrative: string | null
  status: string
  periodStart: string
  periodEnd: string
  generatedAt: string | null
  createdAt: string
  teamName: string | null
  reviewedAt?: string | null
  reviewedByName?: string | null
  reviewNotes?: string | null
  deliveries: Delivery[]
}

interface MonthlyHealthViewProps {
  report: ReportData
  userRole?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MonthlyMetric {
  label: string
  value: string | number
  prevValue: string | number
  trend: "UP" | "DOWN" | "STABLE"
  trendLabel: string
}

function getMonthlyMetrics(content: Record<string, any>): MonthlyMetric[] {
  if (Array.isArray(content.monthlyMetrics)) return content.monthlyMetrics
  if (Array.isArray(content.monthly_metrics)) return content.monthly_metrics

  return [
    {
      label: "Team Velocity",
      value: "87 pts",
      prevValue: "82 pts",
      trend: "UP" as const,
      trendLabel: "+6.1%",
    },
    {
      label: "Avg Cycle Time",
      value: "3.2 days",
      prevValue: "3.8 days",
      trend: "DOWN" as const,
      trendLabel: "-15.8%",
    },
    {
      label: "PR Merge Rate",
      value: "94%",
      prevValue: "91%",
      trend: "UP" as const,
      trendLabel: "+3.3%",
    },
    {
      label: "Bug Escape Rate",
      value: "2.1%",
      prevValue: "3.5%",
      trend: "DOWN" as const,
      trendLabel: "-40%",
    },
  ]
}

function getTrendData(
  content: Record<string, any>
): { month: string; current: number; previous: number }[] {
  if (Array.isArray(content.trendData)) return content.trendData
  if (Array.isArray(content.trend_data)) return content.trend_data

  return [
    { month: "Week 1", current: 22, previous: 18 },
    { month: "Week 2", current: 28, previous: 24 },
    { month: "Week 3", current: 19, previous: 21 },
    { month: "Week 4", current: 18, previous: 19 },
  ]
}

function getHealthScore(content: Record<string, any>): number {
  return content.healthScore ?? content.health_score ?? 78
}

function getHealthSummary(content: Record<string, any>): {
  category: string
  score: number
  description: string
}[] {
  if (Array.isArray(content.healthSummary)) return content.healthSummary
  if (Array.isArray(content.health_summary)) return content.health_summary

  return [
    {
      category: "Delivery",
      score: 85,
      description: "Strong velocity and consistent delivery patterns",
    },
    {
      category: "Quality",
      score: 78,
      description: "Bug escape rate improved, code coverage stable",
    },
    {
      category: "Collaboration",
      score: 72,
      description: "Review times improving but still above target",
    },
    {
      category: "Sustainability",
      score: 80,
      description: "Healthy WIP limits and balanced workload distribution",
    },
  ]
}

function getTrendIcon(trend: "UP" | "DOWN" | "STABLE") {
  switch (trend) {
    case "UP":
      return <TrendingUp className="h-4 w-4" />
    case "DOWN":
      return <TrendingDown className="h-4 w-4" />
    case "STABLE":
      return <Minus className="h-4 w-4" />
  }
}

function getHealthColor(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 50) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function getHealthBgColor(score: number): string {
  if (score >= 75) return "bg-emerald-100 dark:bg-emerald-900"
  if (score >= 50) return "bg-amber-100 dark:bg-amber-900"
  return "bg-red-100 dark:bg-red-900"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthlyHealthView({ report, userRole }: MonthlyHealthViewProps) {
  const monthlyMetrics = getMonthlyMetrics(report.content)
  const trendData = getTrendData(report.content)
  const healthScore = getHealthScore(report.content)
  const healthSummary = getHealthSummary(report.content)

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      {/* Report Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300">
            Monthly Health
          </Badge>
          <Badge
            className={cn(
              "text-xs",
              report.status === "GENERATED"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : report.status === "DELIVERED"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
            )}
          >
            {report.status}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{report.title}</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {format(new Date(report.periodStart), "MMMM yyyy")}
          </span>
          {report.generatedAt && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Generated{" "}
              {format(new Date(report.generatedAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
          )}
          {report.teamName && (
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {report.teamName}
            </span>
          )}
        </div>
      </div>

      {/* Monthly Metrics Overview (4 metric cards) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {monthlyMetrics.map((metric, idx) => (
          <Card key={idx}>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-1 text-2xl font-bold">{metric.value}</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    metric.label === "Bug Escape Rate" || metric.label === "Avg Cycle Time"
                      ? metric.trend === "DOWN"
                        ? "text-emerald-600"
                        : "text-red-600"
                      : metric.trend === "UP"
                        ? "text-emerald-600"
                        : metric.trend === "DOWN"
                          ? "text-red-600"
                          : "text-muted-foreground"
                  )}
                >
                  {getTrendIcon(metric.trend)}
                  {metric.trendLabel}
                </span>
                <span className="text-xs text-muted-foreground">
                  vs prev: {metric.prevValue}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Charts (month-over-month comparison) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Month-over-Month Comparison
          </CardTitle>
          <CardDescription>
            Weekly throughput comparison with the previous month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="month"
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                <Bar
                  dataKey="previous"
                  fill="hsl(var(--muted-foreground))"
                  radius={[4, 4, 0, 0]}
                  name="Previous Month"
                  opacity={0.5}
                />
                <Bar
                  dataKey="current"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="Current Month"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Admin Actions */}
      <ReportActions
        reportId={report.id}
        status={report.status}
        userRole={userRole}
        aiNarrative={report.aiNarrative}
        summary={report.summary}
      />

      {/* Review Status */}
      <ReviewStatusBanner
        status={report.status}
        reviewedAt={report.reviewedAt}
        reviewedByName={report.reviewedByName}
        reviewNotes={report.reviewNotes}
      />

      {/* AI Narrative */}
      {report.aiNarrative && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Narrative</CardTitle>
            <CardDescription>
              AI-generated analysis of monthly team health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {report.aiNarrative.split("\n").map((paragraph, idx) => (
                <p key={idx} className="text-sm leading-relaxed text-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Score Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="h-4 w-4 text-red-500" />
            Health Score Summary
          </CardTitle>
          <CardDescription>
            Composite health assessment across key categories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall Score */}
          <div className="flex items-center justify-center">
            <div className="text-center">
              <p
                className={cn(
                  "text-6xl font-bold",
                  getHealthColor(healthScore)
                )}
              >
                {healthScore}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Overall Health Score
              </p>
            </div>
          </div>

          <Separator />

          {/* Category Breakdown */}
          <div className="grid gap-4 sm:grid-cols-2">
            {healthSummary.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.category}</span>
                  <span
                    className={cn(
                      "rounded-md px-2.5 py-0.5 text-sm font-bold",
                      getHealthBgColor(item.score),
                      getHealthColor(item.score)
                    )}
                  >
                    {item.score}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
                {/* Progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      item.score >= 75
                        ? "bg-emerald-500"
                        : item.score >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deliveries */}
      {report.deliveries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {delivery.channel}
                    </Badge>
                    <span className="text-sm">
                      {delivery.recipientName ??
                        delivery.recipientEmail ??
                        "Unknown"}
                    </span>
                  </div>
                  <Badge
                    className={cn(
                      "text-xs",
                      delivery.status === "SENT"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                        : delivery.status === "FAILED"
                          ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                    )}
                  >
                    {delivery.status}
                    {delivery.sentAt &&
                      ` - ${format(new Date(delivery.sentAt), "MMM d, h:mm a")}`}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
