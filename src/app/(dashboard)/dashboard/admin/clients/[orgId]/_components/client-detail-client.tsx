"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Github,
  MessageSquare,
  Layers,
  Calendar,
  Check,
  XCircle,
  Loader2,
  RefreshCw,
  FileText,
  Building2,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ClientData {
  id: string
  name: string
  slug: string
  plan: string
  createdAt: string
  integrations: {
    type: string
    status: string
    connectedAt: string
    expiresAt: string | null
  }[]
  onboarding: {
    email: string
    clientName: string
    status: string
    expiresAt: string
    completedAt: string | null
  } | null
  reports: {
    id: string
    type: string
    title: string
    status: string
    createdAt: string
    generatedAt: string | null
  }[]
  reportCount: number
}

interface HealthResult {
  ok: boolean
  message: string
  type: string
  status: string
  connectedAt?: string
  sampleData?: Record<string, unknown>
}

const INTEGRATION_CONFIG: Record<string, { label: string; icon: React.ElementType }> = {
  GITHUB: { label: "GitHub", icon: Github },
  SLACK: { label: "Slack", icon: MessageSquare },
  LINEAR: { label: "Linear", icon: Layers },
  GOOGLE_CALENDAR: { label: "Google Calendar", icon: Calendar },
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  GENERATED: "bg-emerald-100 text-emerald-700",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  DELIVERED: "bg-blue-100 text-blue-700",
}

export function ClientDetailClient({ client }: { client: ClientData }) {
  const router = useRouter()
  const [healthData, setHealthData] = useState<Record<string, HealthResult> | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function checkHealth() {
    setHealthLoading(true)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}/health`)
      if (res.ok) {
        const data = await res.json()
        setHealthData(data)
      }
    } catch {
      // ignore
    } finally {
      setHealthLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerateReport() {
    setGenerating(true)
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WEEKLY_DIGEST", orgId: client.id }),
      })
      if (res.ok) {
        const report = await res.json()
        router.push(`/dashboard/reports/${report.id}`)
      } else {
        const data = await res.json()
        alert(data.error || "Failed to generate report")
      }
    } catch {
      alert("Network error")
    } finally {
      setGenerating(false)
    }
  }

  const connectedCount = client.integrations.filter((i) => i.status === "CONNECTED").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/admin/clients")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">{client.name}</h1>
              {client.onboarding && (
                <p className="text-sm text-muted-foreground">
                  {client.onboarding.clientName} - {client.onboarding.email}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkHealth} disabled={healthLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", healthLoading && "animate-spin")} />
            Test Connections
          </Button>
          <Button size="sm" onClick={handleGenerateReport} disabled={generating}>
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 mr-1.5" />
            )}
            Generate Report
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Integrations</CardDescription>
            <CardTitle className="text-2xl">{connectedCount}/4</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {connectedCount === 4
                ? "All integrations connected"
                : `${4 - connectedCount} integration(s) pending`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reports</CardDescription>
            <CardTitle className="text-2xl">{client.reportCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Total reports generated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Onboarding</CardDescription>
            <CardTitle className="text-2xl">
              {client.onboarding?.status === "COMPLETED" ? "Complete" : "Pending"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Added {format(new Date(client.createdAt), "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Integration Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Connection Health
          </CardTitle>
          <CardDescription>
            Live status of each integration and sample data verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {["GITHUB", "SLACK", "LINEAR", "GOOGLE_CALENDAR"].map((type) => {
            const config = INTEGRATION_CONFIG[type]
            const Icon = config.icon
            const health = healthData?.[type]
            const integration = client.integrations.find((i) => i.type === type)
            const isConnected = integration?.status === "CONNECTED"

            return (
              <div
                key={type}
                className={cn(
                  "rounded-lg border p-4",
                  health?.ok
                    ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                    : isConnected
                      ? "border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20"
                      : "border-muted"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-lg",
                        isConnected
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{config.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {healthLoading ? (
                          "Checking..."
                        ) : health ? (
                          health.message
                        ) : isConnected ? (
                          "Connected"
                        ) : (
                          "Not connected"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {healthLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : health?.ok ? (
                      <Check className="h-5 w-5 text-green-600" />
                    ) : isConnected ? (
                      <XCircle className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Sample data */}
                {health?.sampleData && (
                  <div className="mt-3 rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Sample Data
                    </p>
                    <pre className="text-xs text-muted-foreground overflow-auto max-h-32">
                      {JSON.stringify(health.sampleData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.reports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No reports generated yet
            </p>
          ) : (
            <div className="space-y-2">
              {client.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/dashboard/reports/${report.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{report.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.generatedAt
                          ? format(new Date(report.generatedAt), "MMM d, yyyy 'at' h:mm a")
                          : format(new Date(report.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <Badge className={cn("text-xs", STATUS_COLORS[report.status] || "")}>
                    {report.status.replace("_", " ")}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
