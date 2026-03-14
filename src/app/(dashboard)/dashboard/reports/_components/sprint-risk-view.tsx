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
import { RiskGauge } from "@/components/dashboard/risk-gauge"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  XCircle,
  Target,
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

interface SprintRiskViewProps {
  report: ReportData
  userRole?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RiskSignal {
  name: string
  value: number
  weight: number
  trend: "UP" | "DOWN" | "STABLE"
  description: string
}

function getRiskScore(content: Record<string, any>): number {
  return content.riskScore ?? content.risk_score ?? 45
}

function getRiskSignals(content: Record<string, any>): RiskSignal[] {
  if (Array.isArray(content.riskSignals)) return content.riskSignals
  if (Array.isArray(content.risk_signals)) return content.risk_signals
  if (Array.isArray(content.signals)) return content.signals

  return [
    { name: "Velocity Deviation", value: 35, weight: 1.2, trend: "UP" as const, description: "Team velocity is 15% below the 3-sprint average" },
    { name: "Scope Creep", value: 45, weight: 1.0, trend: "UP" as const, description: "4 new tickets added mid-sprint" },
    { name: "Blocked Items", value: 20, weight: 1.5, trend: "DOWN" as const, description: "2 tickets currently blocked" },
    { name: "Review Bottleneck", value: 55, weight: 1.0, trend: "STABLE" as const, description: "PRs waiting for review increased" },
    { name: "Burndown Deviation", value: 40, weight: 1.3, trend: "UP" as const, description: "Behind ideal burndown by 18%" },
    { name: "Carryover Risk", value: 30, weight: 0.8, trend: "STABLE" as const, description: "3 tickets likely to carry over" },
    { name: "Dependency Risk", value: 25, weight: 1.1, trend: "DOWN" as const, description: "External dependencies on schedule" },
    { name: "Team Availability", value: 15, weight: 0.9, trend: "STABLE" as const, description: "No planned absences this sprint" },
  ]
}

function getActionItems(content: Record<string, any>): string[] {
  if (Array.isArray(content.actionItems)) return content.actionItems
  if (Array.isArray(content.action_items)) return content.action_items
  if (Array.isArray(content.recommendations)) return content.recommendations
  return [
    "Address the 2 blocked tickets by coordinating with the backend team",
    "Review and triage the 4 newly added tickets for priority alignment",
    "Schedule a mid-sprint check-in to reassess scope",
    "Assign additional reviewer capacity to unblock the PR queue",
  ]
}

function getSprintInfo(content: Record<string, any>) {
  return {
    sprintName: content.sprintName ?? content.sprint_name ?? "Sprint 24",
    sprintGoal: content.sprintGoal ?? content.sprint_goal ?? "Complete authentication module and API integration",
    totalPoints: content.totalPoints ?? content.total_points ?? 42,
    completedPoints: content.completedPoints ?? content.completed_points ?? 24,
    daysRemaining: content.daysRemaining ?? content.days_remaining ?? 5,
  }
}

function getTrendIcon(trend: "UP" | "DOWN" | "STABLE") {
  switch (trend) {
    case "UP":
      return <TrendingUp className="h-4 w-4 text-red-500" />
    case "DOWN":
      return <TrendingDown className="h-4 w-4 text-emerald-500" />
    case "STABLE":
      return <Minus className="h-4 w-4 text-muted-foreground" />
  }
}

function getRiskColor(value: number): string {
  if (value <= 30) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
  if (value <= 60) return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
  return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SprintRiskView({ report, userRole }: SprintRiskViewProps) {
  const riskScore = getRiskScore(report.content)
  const riskSignals = getRiskSignals(report.content)
  const actionItems = getActionItems(report.content)
  const sprintInfo = getSprintInfo(report.content)

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
          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900 dark:text-orange-300">
            Sprint Risk
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
            {format(new Date(report.periodStart), "MMM d")} -{" "}
            {format(new Date(report.periodEnd), "MMM d, yyyy")}
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

      {/* Sprint Info Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            {sprintInfo.sprintName}
          </CardTitle>
          <CardDescription>{sprintInfo.sprintGoal}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">
                {sprintInfo.completedPoints}/{sprintInfo.totalPoints}
              </p>
              <p className="text-xs text-muted-foreground">Points Completed</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{sprintInfo.daysRemaining}</p>
              <p className="text-xs text-muted-foreground">Days Remaining</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">
                {Math.round(
                  (sprintInfo.completedPoints / sprintInfo.totalPoints) * 100
                )}
                %
              </p>
              <p className="text-xs text-muted-foreground">Sprint Progress</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Score Gauge */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Overall Risk Score
          </CardTitle>
          <CardDescription>
            Composite risk assessment based on 8 signal categories
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <RiskGauge value={riskScore} label="Sprint Risk" size={220} />
        </CardContent>
      </Card>

      {/* Risk Signal Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Risk Signal Breakdown
          </CardTitle>
          <CardDescription>
            Individual risk factors contributing to the overall score
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {riskSignals.map((signal, idx) => (
              <div key={idx} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{signal.name}</span>
                  {getTrendIcon(signal.trend)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge className={cn("text-xs", getRiskColor(signal.value))}>
                    {signal.value}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    w: {signal.weight}x
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {signal.description}
                </p>
              </div>
            ))}
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
        orgId={(report as any).orgId}
      />

      {/* Review Status */}
      <ReviewStatusBanner
        status={report.status}
        reviewedAt={report.reviewedAt}
        reviewedByName={report.reviewedByName}
        reviewNotes={report.reviewNotes}
      />

      {/* AI Narrative / Recommendations */}
      {report.aiNarrative && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Analysis</CardTitle>
            <CardDescription>
              AI-generated risk analysis and recommendations
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

      {/* Action Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action Items</CardTitle>
          <CardDescription>
            Recommended actions to mitigate identified risks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {actionItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary text-xs font-bold text-primary">
                  {idx + 1}
                </div>
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
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
                  <div className="flex items-center gap-2">
                    {delivery.status === "SENT" ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : delivery.status === "FAILED" ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {delivery.status}
                      {delivery.sentAt &&
                        ` - ${format(new Date(delivery.sentAt), "MMM d, h:mm a")}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
