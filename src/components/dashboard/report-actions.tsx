"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Pencil,
  Sparkles,
  Send,
  CheckCircle2,
  XCircle,
  Save,
  X,
  Download,
} from "lucide-react"

interface ReportActionsProps {
  reportId: string
  status: string
  userRole?: string
  aiNarrative: string | null
  summary: string | null
  onNarrativeChange?: (newNarrative: string) => void
  onSummaryChange?: (newSummary: string) => void
}

export function ReportActions({
  reportId,
  status,
  userRole,
  aiNarrative,
  summary,
  onNarrativeChange,
  onSummaryChange,
}: ReportActionsProps) {
  const router = useRouter()
  const isAdmin = userRole === "ADMIN"
  const [editing, setEditing] = useState(false)
  const [editNarrative, setEditNarrative] = useState(aiNarrative || "")
  const [editSummary, setEditSummary] = useState(summary || "")
  const [saving, setSaving] = useState(false)

  // Regenerate dialog
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenPrompt, setRegenPrompt] = useState("")
  const [regenerating, setRegenerating] = useState(false)

  // PDF download
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Deliver dialog
  const [deliverOpen, setDeliverOpen] = useState(false)
  const [deliverEmail, setDeliverEmail] = useState("")
  const [delivering, setDelivering] = useState(false)

  // Review dialog
  const [reviewAction, setReviewAction] = useState<"APPROVE" | "REJECT" | null>(null)
  const [reviewNotes, setReviewNotes] = useState("")
  const [reviewing, setReviewing] = useState(false)

  if (!isAdmin) return null

  async function handleSaveEdit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/reports/${reportId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiNarrative: editNarrative,
          summary: editSummary,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to save")
        return
      }
      setEditing(false)
      onNarrativeChange?.(editNarrative)
      onSummaryChange?.(editSummary)
      router.refresh()
    } catch {
      alert("Network error")
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/reports/${reportId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regenerateNarrative: true,
          narrativePrompt: regenPrompt || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to regenerate")
        return
      }
      const updated = await res.json()
      setEditNarrative(updated.aiNarrative || "")
      onNarrativeChange?.(updated.aiNarrative || "")
      setRegenOpen(false)
      setRegenPrompt("")
      router.refresh()
    } catch {
      alert("Network error")
    } finally {
      setRegenerating(false)
    }
  }

  async function handleReview() {
    if (!reviewAction) return
    setReviewing(true)
    try {
      const res = await fetch(`/api/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reviewAction,
          notes: reviewNotes || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to review")
        return
      }
      setReviewAction(null)
      setReviewNotes("")
      router.refresh()
    } catch {
      alert("Network error")
    } finally {
      setReviewing(false)
    }
  }

  async function handleDeliver() {
    if (!deliverEmail) return
    setDelivering(true)
    try {
      const res = await fetch(`/api/reports/${reportId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: deliverEmail }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Failed to deliver")
        return
      }
      alert(`Report sent to ${deliverEmail}`)
      setDeliverOpen(false)
      setDeliverEmail("")
      router.refresh()
    } catch {
      alert("Network error")
    } finally {
      setDelivering(false)
    }
  }

  return (
    <>
      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <span className="mr-2 text-sm font-medium text-muted-foreground">
          Admin Actions:
        </span>

        {/* Preview HTML */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(`/api/reports/${reportId}/pdf`, "_blank")}
        >
          Preview Report
        </Button>

        {/* Download PDF */}
        <Button
          size="sm"
          variant="outline"
          disabled={downloadingPdf}
          onClick={async () => {
            setDownloadingPdf(true)
            try {
              const res = await fetch(`/api/reports/${reportId}/pdf?format=pdf`)
              if (!res.ok) {
                alert("Failed to generate PDF")
                return
              }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `report-${reportId}.pdf`
              a.click()
              URL.revokeObjectURL(url)
            } catch {
              alert("Failed to download PDF")
            } finally {
              setDownloadingPdf(false)
            }
          }}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          {downloadingPdf ? "Generating..." : "Download PDF"}
        </Button>

        {/* Edit */}
        {!editing ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditNarrative(aiNarrative || "")
              setEditSummary(summary || "")
              setEditing(true)
            }}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit Report
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Regenerate AI */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRegenOpen(true)}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          Regenerate AI
        </Button>

        {/* Review buttons */}
        {status === "PENDING_REVIEW" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setReviewAction("REJECT")}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setReviewAction("APPROVE")}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Approve
            </Button>
          </>
        )}

        {/* Deliver */}
        {status === "APPROVED" && (
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setDeliverOpen(true)}
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            Send to Client
          </Button>
        )}
      </div>

      {/* Inline Edit Area */}
      {editing && (
        <div className="space-y-4 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
          <div>
            <label className="text-sm font-medium">Summary</label>
            <textarea
              className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">AI Narrative</label>
            <textarea
              className="mt-1 flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={editNarrative}
              onChange={(e) => setEditNarrative(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Regenerate Dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate AI Narrative</DialogTitle>
            <DialogDescription>
              Optionally provide instructions to guide the AI. Leave blank to
              regenerate with default prompts.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="e.g. Make it more concise, focus on the positive wins, emphasize the deployment metrics..."
            value={regenPrompt}
            onChange={(e) => setRegenPrompt(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerate} disabled={regenerating}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {regenerating ? "Regenerating..." : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog
        open={!!reviewAction}
        onOpenChange={(open) => !open && setReviewAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "APPROVE" ? "Approve Report" : "Reject Report"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "APPROVE"
                ? "Once approved, you can send this report to the client."
                : "The report will be marked as rejected. Add notes explaining what needs to change."}
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Notes..."
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewAction(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={reviewing}
              className={
                reviewAction === "APPROVE"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {reviewing
                ? "Submitting..."
                : reviewAction === "APPROVE"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliver Dialog */}
      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Report to Client</DialogTitle>
            <DialogDescription>
              This will email the report narrative and summary to the client.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">Client Email</label>
            <Input
              className="mt-1"
              type="email"
              placeholder="client@company.com"
              value={deliverEmail}
              onChange={(e) => setDeliverEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeliver}
              disabled={delivering || !deliverEmail}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              {delivering ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
