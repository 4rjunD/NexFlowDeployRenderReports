"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  Zap,
  Github,
  Layers,
  MessageSquare,
  Calendar,
  Check,
  ArrowRight,
  Loader2,
  AlertCircle,
  FileText,
  ExternalLink,
  PenLine,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingData {
  clientName: string
  email: string
  companyName: string
  orgId: string
  connectedIntegrations: string[]
  allIntegrations: { type: string; status: string }[]
}

interface IntegrationDef {
  id: string
  type: string
  name: string
  description: string
  icon: React.ReactNode
  disabled?: boolean
}

interface ReportPreferences {
  customContext: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "github",
    type: "GITHUB",
    name: "GitHub",
    description: "Pull request, commit, and CI data",
    icon: <Github className="h-5 w-5" />,
  },
  {
    id: "slack",
    type: "SLACK",
    name: "Slack",
    description: "Team communication patterns",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    id: "linear",
    type: "LINEAR",
    name: "Linear",
    description: "Issue and cycle tracking",
    icon: <Layers className="h-5 w-5" />,
  },
  {
    id: "gcal",
    type: "GOOGLE_CALENDAR",
    name: "Google Calendar",
    description: "Meeting load analysis",
    icon: <Calendar className="h-5 w-5" />,
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const router = useRouter()
  const params = useParams()
  const token = (params?.token ?? "") as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null)

  const [requestingReport, setRequestingReport] = useState(false)
  const [reportRequested, setReportRequested] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // Report customization state
  const [prefs, setPrefs] = useState<ReportPreferences>({
    customContext: "",
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)

  // -------------------------------------------------------------------------
  // Fetch onboarding data
  // -------------------------------------------------------------------------

  const fetchOnboardingData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/setup/${token}`)
      const data = await res.json()

      if (!res.ok) {
        if (data.expired) {
          setExpired(true)
          setError("This setup link has expired. Please contact your admin for a new link.")
        } else if (data.completed) {
          setCompleted(true)
          setError("This setup has already been completed.")
        } else {
          setError(data.error || "Invalid setup link")
        }
        return
      }

      setOnboardingData(data)
      setError(null)

      // Load existing preferences
      try {
        const prefRes = await fetch(`/api/org/preferences?orgId=${data.orgId}`)
        if (prefRes.ok) {
          const existingPrefs = await prefRes.json()
          if (existingPrefs && Object.keys(existingPrefs).length > 0) {
            setPrefs({
              customContext: existingPrefs.customContext || "",
            })
            setPrefsSaved(true)
          }
        }
      } catch {
        // Ignore — preferences are optional
      }
    } catch {
      setError("Failed to load setup data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchOnboardingData()
  }, [fetchOnboardingData])

  useEffect(() => {
    function handleFocus() {
      if (!error && !completed) {
        fetchOnboardingData()
      }
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [fetchOnboardingData, error, completed])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleConnect(integrationType: string) {
    const routeMap: Record<string, string> = {
      GITHUB: "github",
      SLACK: "slack",
      LINEAR: "linear",
      GOOGLE_CALENDAR: "google",
    }
    const routePath = routeMap[integrationType] || integrationType.toLowerCase()
    const connectUrl = `/api/integrations/${routePath}/connect?onboarding=${token}`
    window.open(connectUrl, "_blank")
  }

  async function handleSavePreferences() {
    if (!onboardingData) return
    setSavingPrefs(true)
    try {
      await fetch("/api/org/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: onboardingData.orgId,
          preferences: prefs,
        }),
      })
      setPrefsSaved(true)
    } catch {
      // Silent fail — preferences are not blocking
    } finally {
      setSavingPrefs(false)
    }
  }

  async function handleRequestReport() {
    if (!onboardingData) return

    setRequestingReport(true)
    setReportError(null)

    // Save preferences first if not saved
    if (!prefsSaved && prefs.customContext) {
      await handleSavePreferences()
    }

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WEEKLY_DIGEST",
          orgId: onboardingData.orgId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setReportError(data.error || "Failed to request report")
        return
      }

      setReportRequested(true)
      await fetch(`/api/setup/${token}`, { method: "POST" })
    } catch {
      setReportError("Network error. Please try again.")
    } finally {
      setRequestingReport(false)
    }
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const connectedTypes = new Set(onboardingData?.connectedIntegrations || [])
  const hasAnyConnection = connectedTypes.size > 0

  // -------------------------------------------------------------------------
  // Render: Loading
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading setup...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Error
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">
              {expired ? "Link Expired" : completed ? "Already Completed" : "Invalid Link"}
            </h2>
            <p className="text-muted-foreground text-center max-w-md">{error}</p>
            {completed && (
              <Button onClick={() => router.push("/dashboard")} className="gap-2">
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Report requested
  // -------------------------------------------------------------------------

  if (reportRequested) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Report Requested</h2>
              <p className="text-muted-foreground max-w-md">
                Your first report is being generated. Our team will review it and send it to{" "}
                <strong>{onboardingData?.email}</strong> once it is ready.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground max-w-md text-center">
              <FileText className="h-5 w-5 mx-auto mb-2" />
              Reports typically take 1-2 business days to review and deliver.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Main setup
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <CardTitle className="text-lg font-bold">NexFlow</CardTitle>
          </div>
          <CardDescription className="text-center sr-only">
            Client setup wizard
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6 space-y-8">
          {/* Welcome */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome, {onboardingData?.clientName}
            </h1>
            <p className="text-muted-foreground">
              Set up <strong>{onboardingData?.companyName}</strong> on NexFlow.
              Connect your tools and customize your reports below.
            </p>
          </div>

          {/* Step 1: Integrations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">1. Connect Your Tools</h2>
              {hasAnyConnection && (
                <Badge variant="outline" className="text-green-600 border-green-300">
                  {connectedTypes.size} connected
                </Badge>
              )}
            </div>

            <div className="space-y-3">
              {INTEGRATIONS.map((integration) => {
                const isConnected = connectedTypes.has(integration.type)
                return (
                  <div
                    key={integration.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-4 transition-colors",
                      isConnected
                        ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg",
                          isConnected
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {integration.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {integration.description}
                        </p>
                      </div>
                    </div>

                    {isConnected ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                          <Check className="h-4 w-4" />
                          <span className="text-sm font-medium">Connected</span>
                        </div>
                        {integration.type === "GITHUB" && onboardingData && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const returnTo = `/setup/${token}`
                              window.open(
                                `/setup/github-repos?orgId=${onboardingData.orgId}&returnTo=${encodeURIComponent(returnTo)}`,
                                "_blank"
                              )
                            }}
                            className="text-xs text-muted-foreground"
                          >
                            Configure repos
                          </Button>
                        )}
                      </div>
                    ) : integration.disabled ? (
                      <span className="text-xs text-muted-foreground">Coming soon</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnect(integration.type)}
                        className="gap-1.5"
                      >
                        Connect
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Step 2: Add Context */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">2. Add Context for Your Reports</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Share any context you want the AI analyst to consider — current initiatives, team goals, known challenges, or specific questions you want answered. This shapes every report we generate.
            </p>
            <textarea
              id="customContext"
              rows={4}
              value={prefs.customContext}
              onChange={(e) => {
                setPrefs((prev) => ({ ...prev, customContext: e.target.value }))
                setPrefsSaved(false)
              }}
              placeholder="e.g., We're migrating to microservices this quarter. Focus on delivery risk in the payments-service repo. Our team expanded from 5 to 8 engineers last month — watch for onboarding bottlenecks."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <Separator />

          {/* Step 3: Request Report */}
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">3. Request Your First Report</h2>
              <p className="text-sm text-muted-foreground">
                {hasAnyConnection
                  ? "Your tools are connected. Request your first engineering report."
                  : "Connect at least one integration above to request your first report."}
              </p>
            </div>

            {reportError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive text-center">
                {reportError}
              </div>
            )}

            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={handleRequestReport}
                disabled={!hasAnyConnection || requestingReport}
                className="gap-2"
              >
                {requestingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Request First Report
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
