"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Users,
  Plus,
  Github,
  MessageSquare,
  Layers,
  Calendar,
  Check,
  Clock,
  Send,
  FileText,
  RefreshCw,
  Loader2,
  AlertCircle,
  Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientIntegration {
  type: "GITHUB" | "JIRA" | "LINEAR" | "SLACK" | "GOOGLE_CALENDAR"
  status: "CONNECTED" | "DISCONNECTED" | "PENDING"
}

interface ClientOnboarding {
  id: string
  email: string
  clientName: string
  status: string
  expiresAt: string
  completedAt: string | null
  createdAt: string
}

interface ClientOrg {
  id: string
  name: string
  slug: string
  plan: string
  createdAt: string
  integrations: ClientIntegration[]
  onboarding: ClientOnboarding | null
  reportCount: number
}

interface ClientsListClientProps {
  clients: ClientOrg[]
}

// ---------------------------------------------------------------------------
// Integration icon mapping
// ---------------------------------------------------------------------------

const INTEGRATION_ICONS: Record<string, React.ElementType> = {
  GITHUB: Github,
  SLACK: MessageSquare,
  LINEAR: Layers,
  GOOGLE_CALENDAR: Calendar,
}

const INTEGRATION_LABELS: Record<string, string> = {
  GITHUB: "GitHub",
  SLACK: "Slack",
  LINEAR: "Linear",
  GOOGLE_CALENDAR: "Calendar",
  JIRA: "Jira",
}

// ---------------------------------------------------------------------------
// Client Card
// ---------------------------------------------------------------------------

function ClientCard({
  client,
  onResend,
  onGenerateReport,
}: {
  client: ClientOrg
  onResend: (orgId: string) => void
  onGenerateReport: (orgId: string) => void
}) {
  const connectedIntegrations = client.integrations.filter(
    (i) => i.status === "CONNECTED"
  )
  const onboardingStatus = client.onboarding?.status || "NO_ONBOARDING"
  const isExpired =
    client.onboarding && new Date(client.onboarding.expiresAt) < new Date()
  const isCompleted = onboardingStatus === "COMPLETED"

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{client.name}</CardTitle>
              <CardDescription className="text-xs">
                {client.onboarding?.email || client.slug}
              </CardDescription>
            </div>
          </div>
          {/* Onboarding status badge */}
          {client.onboarding ? (
            <Badge
              className={cn(
                "text-xs",
                isCompleted
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : isExpired
                    ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
              )}
            >
              {isCompleted ? (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Onboarded
                </>
              ) : isExpired ? (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Expired
                </>
              ) : (
                <>
                  <Clock className="mr-1 h-3 w-3" />
                  Pending
                </>
              )}
            </Badge>
          ) : (
            <Badge className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              No invite
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 pb-3 space-y-3">
        {/* Integrations */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Integrations
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["GITHUB", "SLACK", "LINEAR", "GOOGLE_CALENDAR"].map((type) => {
              const integration = client.integrations.find((i) => i.type === type)
              const isConnected = integration?.status === "CONNECTED"
              const Icon = INTEGRATION_ICONS[type] || FileText
              return (
                <div
                  key={type}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                    isConnected
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {INTEGRATION_LABELS[type]}
                  {isConnected && <Check className="h-2.5 w-2.5" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {client.reportCount} report{client.reportCount !== 1 ? "s" : ""}
          </span>
          {client.onboarding?.clientName && (
            <span>Contact: {client.onboarding.clientName}</span>
          )}
        </div>

        {/* Created date */}
        <p className="text-xs text-muted-foreground">
          Added {format(new Date(client.createdAt), "MMM d, yyyy")}
        </p>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4 gap-2">
        <Link
          href={`/dashboard/admin/clients/${client.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          View Details
        </Link>

        <div className="flex gap-2">
          {client.onboarding && !isCompleted && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResend(client.id)}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Resend
            </Button>
          )}

          {connectedIntegrations.length > 0 && (
            <Button
              size="sm"
              onClick={() => onGenerateReport(client.id)}
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Generate
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClientsListClient({ clients }: ClientsListClientProps) {
  const router = useRouter()

  // Add client dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addForm, setAddForm] = useState({ name: "", email: "", companyName: "" })
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Resend state
  const [resendingOrgId, setResendingOrgId] = useState<string | null>(null)

  // Generate report state
  const [generatingOrgId, setGeneratingOrgId] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  async function handleAddClient() {
    if (!addForm.name || !addForm.email || !addForm.companyName) {
      setAddError("All fields are required")
      return
    }

    setAddSubmitting(true)
    setAddError(null)

    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })

      if (!res.ok) {
        const data = await res.json()
        setAddError(data.error || "Failed to add client")
        return
      }

      setShowAddDialog(false)
      setAddForm({ name: "", email: "", companyName: "" })
      router.refresh()
    } catch {
      setAddError("Network error. Please try again.")
    } finally {
      setAddSubmitting(false)
    }
  }

  async function handleResend(orgId: string) {
    setResendingOrgId(orgId)
    try {
      const res = await fetch("/api/admin/clients/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to resend email")
        return
      }

      router.refresh()
    } catch {
      alert("Network error. Please try again.")
    } finally {
      setResendingOrgId(null)
    }
  }

  async function handleGenerateReport(orgId: string) {
    setGeneratingOrgId(orgId)
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WEEKLY_DIGEST", orgId }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to generate report")
        return
      }

      const report = await res.json()

      // Navigate immediately — report is created, generation happens in background
      router.push(`/dashboard/reports/${report.id}`)
    } catch {
      alert("Network error. Please try again.")
    } finally {
      setGeneratingOrgId(null)
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Clients
          </h1>
          <p className="text-muted-foreground">
            Manage client organizations, onboarding, and report generation
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            onClick={() => setShowAddDialog(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Client List */}
      {clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium">No clients yet</p>
            <p className="text-sm text-muted-foreground">
              Add your first client to get started with onboarding.
            </p>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="mt-4 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add First Client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onResend={handleResend}
              onGenerateReport={handleGenerateReport}
            />
          ))}
        </div>
      )}

      {/* Add Client Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>
              Create a new client organization and send an onboarding email with
              a setup link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Contact Name</Label>
              <Input
                id="client-name"
                placeholder="e.g. Jane Doe"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                placeholder="e.g. jane@company.com"
                value={addForm.email}
                onChange={(e) =>
                  setAddForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="e.g. Acme Corp"
                value={addForm.companyName}
                onChange={(e) =>
                  setAddForm((prev) => ({
                    ...prev,
                    companyName: e.target.value,
                  }))
                }
              />
            </div>

            {addError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {addError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={addSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAddClient} disabled={addSubmitting}>
              {addSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Client
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
