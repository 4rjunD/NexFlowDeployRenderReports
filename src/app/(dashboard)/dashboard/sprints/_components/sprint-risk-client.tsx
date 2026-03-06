"use client"

import {
  AlertTriangle,
  Calendar,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import { LineChart } from "@/components/charts/line-chart"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ActiveSprint {
  id: string
  name: string
  goal: string | null
  status: string
  riskScore: number
  startDate: string
  endDate: string
  teamName: string
}

interface SprintSignal {
  id: string
  name: string
  category: string
  value: number
  weight: number
  trend: "UP" | "DOWN" | "STABLE"
  metadata: Record<string, any>
  computedAt: string
}

interface SprintRiskClientProps {
  activeSprint: ActiveSprint | null
  sprintProgress: number
  signals: SprintSignal[]
  riskTrendData: { sprint: string; riskScore: number }[]
}

function getRiskColor(score: number) {
  if (score >= 75) return "text-red-600"
  if (score >= 50) return "text-amber-600"
  if (score >= 25) return "text-yellow-600"
  return "text-emerald-600"
}

function getRiskLabel(score: number) {
  if (score >= 75) return "Critical Risk"
  if (score >= 50) return "High Risk"
  if (score >= 25) return "Medium Risk"
  return "Low Risk"
}

function getRiskRingColor(score: number) {
  if (score >= 75) return "stroke-red-500"
  if (score >= 50) return "stroke-amber-500"
  if (score >= 25) return "stroke-yellow-500"
  return "stroke-emerald-500"
}

function getSignalBarColor(value: number) {
  if (value >= 75) return "bg-red-500"
  if (value >= 50) return "bg-amber-500"
  if (value >= 25) return "bg-yellow-500"
  return "bg-emerald-500"
}

function TrendIcon({ trend }: { trend: "UP" | "DOWN" | "STABLE" }) {
  if (trend === "UP") return <TrendingUp className="h-4 w-4 text-red-500" />
  if (trend === "DOWN") return <TrendingDown className="h-4 w-4 text-emerald-500" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
}

// Risk Gauge Component (SVG-based circular gauge)
function RiskGauge({ score }: { score: number }) {
  const radius = 90
  const strokeWidth = 12
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(100, Math.max(0, score))
  const dashOffset = circumference - (progress / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <svg
          width="220"
          height="220"
          viewBox="0 0 220 220"
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            className={getRiskRingColor(score)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-4xl font-bold", getRiskColor(score))}>
            {Math.round(score)}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "mt-3 text-sm",
          score >= 75 && "border-red-200 bg-red-50 text-red-700",
          score >= 50 && score < 75 && "border-amber-200 bg-amber-50 text-amber-700",
          score >= 25 && score < 50 && "border-yellow-200 bg-yellow-50 text-yellow-700",
          score < 25 && "border-emerald-200 bg-emerald-50 text-emerald-700"
        )}
      >
        {getRiskLabel(score)}
      </Badge>
    </div>
  )
}

// Signal Row Component
function SignalRow({ signal }: { signal: SprintSignal }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{signal.name}</h4>
              <TrendIcon trend={signal.trend} />
            </div>
            {/* Value Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Value</span>
                <span>{Math.round(signal.value)}/100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    getSignalBarColor(signal.value)
                  )}
                  style={{ width: `${Math.min(100, signal.value)}%` }}
                />
              </div>
            </div>
            {/* Weight */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Weight</span>
              <span className="font-mono">{signal.weight.toFixed(1)}x</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SprintRiskClient({
  activeSprint,
  sprintProgress,
  signals,
  riskTrendData,
}: SprintRiskClientProps) {
  if (!activeSprint) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No Active Sprint</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            There are no active sprints to analyze. Start a sprint to see risk
            data.
          </p>
        </div>
      </div>
    )
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (new Date(activeSprint.endDate).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    )
  )

  return (
    <div className="space-y-6">
      {/* Top section: Risk Gauge + Sprint Info */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Risk Score Gauge */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-center text-lg">
              Sprint Risk Score
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <RiskGauge score={activeSprint.riskScore} />
          </CardContent>
        </Card>

        {/* Sprint Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-muted-foreground" />
              {activeSprint.name}
            </CardTitle>
            <CardDescription>{activeSprint.teamName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeSprint.goal && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Sprint Goal
                </p>
                <p className="text-sm">{activeSprint.goal}</p>
              </div>
            )}

            {/* Dates */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Start:</span>
                <span className="font-medium">
                  {new Date(activeSprint.startDate).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" }
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">End:</span>
                <span className="font-medium">
                  {new Date(activeSprint.endDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time Progress</span>
                <span className="font-medium">
                  {sprintProgress}% ({daysRemaining} days remaining)
                </span>
              </div>
              <Progress value={sprintProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Signal Cards (2x4 grid) */}
      {signals.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Risk Signals</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {signals.slice(0, 8).map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {/* Risk Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Risk Trend
          </CardTitle>
          <CardDescription>
            Risk score evolution across sprints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {riskTrendData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sprint history available for trend analysis.
            </p>
          ) : (
            <LineChart
              data={riskTrendData}
              categories={["riskScore"]}
              index="sprint"
              height={300}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
