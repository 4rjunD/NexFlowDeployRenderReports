"use client"

import React, { useState, useEffect, useRef } from "react"
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
  Users,
  Plus,
  Trash2,
  Upload,
  Send,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Recipient {
  id: string
  email: string
  name: string
  role: string
  reportDepth: string
  channels: string[]
  slackUserId: string | null
  active: boolean
}

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
  recipients: Recipient[]
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

const ROLE_OPTIONS = [
  { value: "CTO", label: "CTO" },
  { value: "VP_ENG", label: "VP Engineering" },
  { value: "ENG_DIRECTOR", label: "Eng Director" },
  { value: "ENGINEERING_MANAGER", label: "Eng Manager" },
  { value: "TEAM_LEAD", label: "Team Lead" },
  { value: "IC", label: "IC (Engineer)" },
  { value: "STAKEHOLDER", label: "Stakeholder" },
]

const DEPTH_OPTIONS = [
  { value: "EXECUTIVE", label: "Executive", desc: "Health score + top 5 discoveries" },
  { value: "STANDARD", label: "Standard", desc: "Key metrics + 12 discoveries" },
  { value: "FULL", label: "Full", desc: "Complete report with all details" },
]

const ROLE_COLORS: Record<string, string> = {
  CTO: "bg-purple-100 text-purple-700",
  VP_ENG: "bg-purple-100 text-purple-700",
  ENG_DIRECTOR: "bg-blue-100 text-blue-700",
  ENGINEERING_MANAGER: "bg-blue-100 text-blue-700",
  TEAM_LEAD: "bg-emerald-100 text-emerald-700",
  IC: "bg-gray-100 text-gray-700",
  STAKEHOLDER: "bg-amber-100 text-amber-700",
}

export function ClientDetailClient({ client }: { client: ClientData }) {
  const router = useRouter()
  const [healthData, setHealthData] = useState<Record<string, HealthResult> | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>(client.recipients)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [saving, setSaving] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add form state
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState("TEAM_LEAD")
  const [newDepth, setNewDepth] = useState("FULL")

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

  async function addRecipient() {
    if (!newEmail || !newName) return
    setSaving(true)
    try {
      const res = await fetch("/api/org/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: client.id,
          email: newEmail,
          name: newName,
          role: newRole,
          reportDepth: newDepth,
          channels: ["EMAIL"],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setRecipients((prev) => [...prev, data.recipient])
        setNewName("")
        setNewEmail("")
        setNewRole("TEAM_LEAD")
        setNewDepth("FULL")
        setShowAddForm(false)
      }
    } catch {
      alert("Failed to add recipient")
    } finally {
      setSaving(false)
    }
  }

  async function removeRecipient(id: string) {
    if (!confirm("Remove this recipient?")) return
    try {
      await fetch(`/api/org/recipients?id=${id}`, { method: "DELETE" })
      setRecipients((prev) => prev.filter((r) => r.id !== id))
    } catch {
      alert("Failed to remove recipient")
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      const res = await fetch("/api/org/recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: !active }),
      })
      if (res.ok) {
        setRecipients((prev) => prev.map((r) => r.id === id ? { ...r, active: !active } : r))
      }
    } catch {
      alert("Failed to update recipient")
    }
  }

  async function handleCsvImport() {
    if (!csvText.trim()) return
    setSaving(true)
    setImportResult(null)
    try {
      const res = await fetch("/api/org/recipients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: client.id, csv: csvText }),
      })
      const data = await res.json()
      if (res.ok) {
        setImportResult(`${data.created} added, ${data.updated} updated, ${data.skipped} skipped`)
        // Refresh recipients
        const listRes = await fetch(`/api/org/recipients?orgId=${client.id}`)
        if (listRes.ok) {
          const listData = await listRes.json()
          setRecipients(listData.recipients)
        }
        setCsvText("")
        setTimeout(() => setShowCsvImport(false), 2000)
      } else {
        setImportResult(`Error: ${data.error}`)
      }
    } catch {
      setImportResult("Import failed")
    } finally {
      setSaving(false)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || "")
    }
    reader.readAsText(file)
  }

  const connectedCount = client.integrations.filter((i) => i.status === "CONNECTED").length
  const activeRecipients = recipients.filter((r) => r.active)

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
      <div className="grid gap-4 md:grid-cols-4">
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
            <CardDescription>Recipients</CardDescription>
            <CardTitle className="text-2xl">{activeRecipients.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {recipients.length > activeRecipients.length
                ? `${recipients.length - activeRecipients.length} inactive`
                : "All active"}
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

      {/* Report Recipients */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Report Recipients
              </CardTitle>
              <CardDescription>
                Manage who receives reports and at what depth. Each role gets a tailored view.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowCsvImport(!showCsvImport); setShowAddForm(false) }}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                CSV Import
              </Button>
              <Button
                size="sm"
                onClick={() => { setShowAddForm(!showAddForm); setShowCsvImport(false) }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Recipient
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CSV Import Panel */}
          {showCsvImport && (
            <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Bulk CSV Import</p>
                <Button variant="ghost" size="sm" onClick={() => setShowCsvImport(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Format: <code>email,name,role,reportDepth</code> — one per line. First row is header.
                <br />
                Roles: CTO, VP_ENG, ENG_DIRECTOR, ENGINEERING_MANAGER, TEAM_LEAD, IC, STAKEHOLDER
                <br />
                Depths: EXECUTIVE, STANDARD, FULL
              </p>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload CSV File
                </Button>
              </div>
              <textarea
                className="w-full rounded-md border p-3 text-xs font-mono bg-background min-h-[120px] resize-y"
                placeholder={`email,name,role,reportDepth\ncto@acme.com,Jane Smith,CTO,EXECUTIVE\nvp@acme.com,John Doe,VP_ENG,EXECUTIVE\nlead@acme.com,Alex Chen,TEAM_LEAD,FULL`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleCsvImport} disabled={saving || !csvText.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                  Import
                </Button>
                {importResult && (
                  <span className={cn("text-xs", importResult.startsWith("Error") ? "text-red-600" : "text-green-600")}>
                    {importResult}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Add Single Recipient Form */}
          {showAddForm && (
            <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Add Recipient</p>
                <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-md border px-3 py-2 text-sm bg-background"
                  placeholder="Full name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm bg-background"
                  placeholder="Email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <select
                  className="rounded-md border px-3 py-2 text-sm bg-background"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <select
                  className="rounded-md border px-3 py-2 text-sm bg-background"
                  value={newDepth}
                  onChange={(e) => setNewDepth(e.target.value)}
                >
                  {DEPTH_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label} — {d.desc}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={addRecipient} disabled={saving || !newEmail || !newName}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                Add
              </Button>
            </div>
          )}

          {/* Recipients List */}
          {recipients.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No recipients configured yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add recipients to enable multi-person report delivery</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recipients.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 transition-colors",
                    r.active ? "hover:bg-muted/50" : "opacity-50 bg-muted/20"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                      {r.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <Badge className={cn("text-[10px] px-1.5 py-0", ROLE_COLORS[r.role] || "")}>
                          {r.role.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {r.reportDepth}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="flex gap-1 mr-2">
                      {r.channels.map((ch) => (
                        <Badge key={ch} variant="outline" className="text-[10px] px-1 py-0">
                          {ch === "EMAIL" ? "Email" : "Slack"}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => toggleActive(r.id, r.active)}
                      title={r.active ? "Deactivate" : "Activate"}
                    >
                      {r.active ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      onClick={() => removeRecipient(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Deliver to all recipients hint */}
          {activeRecipients.length > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
              <Send className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                When delivering a report, use <strong>"Deliver to All"</strong> to send role-tailored reports to all {activeRecipients.length} active recipients at once.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
