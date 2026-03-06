"use client"

import React, { useState, useMemo, useEffect } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Send,
  FileText,
  MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ReviewReport {
  id: string
  type: "WEEKLY_DIGEST" | "SPRINT_RISK" | "MONTHLY_HEALTH"
  title: string
  summary: string | null
  status: "DRAFT" | "GENERATED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "DELIVERED"
  periodStart: string
  periodEnd: string
  generatedAt: string | null
  createdAt: string
  teamName: string | null
  orgName: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  reviewNotes: string | null
}

interface AdminReviewClientProps {
  reports: ReviewReport[]
}

const TYPE_CONFIG: Record<
  ReviewReport["type"],
  { label: string; color: string }
> = {
  WEEKLY_DIGEST: {
    label: "Weekly Digest",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  SPRINT_RISK: {
    label: "Sprint Risk",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  MONTHLY_HEALTH: {
    label: "Monthly Health",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
}

const STATUS_CONFIG: Record<
  ReviewReport["status"],
  { label: string; color: string; icon: React.ElementType }
> = {
  DRAFT: {
    label: "Draft",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    icon: FileText,
  },
  GENERATED: {
    label: "Generated",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    icon: FileText,
  },
  PENDING_REVIEW: {
    label: "Pending Review",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "Rejected",
    color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    icon: XCircle,
  },
  DELIVERED: {
    label: "Delivered",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    icon: Send,
  },
}

function ReviewCard({
  report,
  onReview,
}: {
  report: ReviewReport
  onReview: (id: string, action: "APPROVE" | "REJECT") => void
}) {
  const typeConfig = TYPE_CONFIG[report.type]
  const statusConfig = STATUS_CONFIG[report.status]
  const StatusIcon = statusConfig.icon
  const isPending = report.status === "PENDING_REVIEW"

  return (
    <Card
      className={cn(
        "flex flex-col transition-shadow hover:shadow-md",
        isPending && "ring-2 ring-yellow-400/50"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs", typeConfig.color)}>
            {typeConfig.label}
          </Badge>
          <Badge className={cn("text-xs inline-flex items-center gap-1", statusConfig.color)}>
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
        <CardTitle className="mt-2 text-lg leading-tight">
          {report.title}
        </CardTitle>
        <CardDescription>
          {report.orgName && (
            <span className="font-medium text-foreground">{report.orgName}</span>
          )}
          {report.orgName && " — "}
          {format(new Date(report.periodStart), "MMM d")} -{" "}
          {format(new Date(report.periodEnd), "MMM d, yyyy")}
          {report.teamName && (
            <span className="ml-2 text-xs">({report.teamName})</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 pb-3 space-y-2">
        {report.summary && (
          <p className="text-sm text-muted-foreground">{report.summary}</p>
        )}
        {report.reviewNotes && (
          <div className="flex items-start gap-1.5 rounded-md bg-muted p-2">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">{report.reviewNotes}</p>
          </div>
        )}
        {report.reviewedAt && report.reviewedByName && (
          <p className="text-xs text-muted-foreground">
            Reviewed by {report.reviewedByName} on{" "}
            {format(new Date(report.reviewedAt), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4 gap-2">
        <Link
          href={`/dashboard/reports/${report.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {isPending && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => onReview(report.id, "REJECT")}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onReview(report.id, "APPROVE")}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}

export function AdminReviewClient({ reports }: AdminReviewClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("pending")

  // Auto-refresh every 5 seconds to pick up newly generated reports
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, 5000)
    return () => clearInterval(interval)
  }, [router])
  const [reviewDialog, setReviewDialog] = useState<{
    reportId: string
    action: "APPROVE" | "REJECT"
  } | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const pendingReports = useMemo(
    () => reports.filter((r) => r.status === "PENDING_REVIEW"),
    [reports]
  )
  const reviewedReports = useMemo(
    () => reports.filter((r) => r.status === "APPROVED" || r.status === "REJECTED"),
    [reports]
  )
  const allReports = reports

  const displayedReports = useMemo(() => {
    switch (activeTab) {
      case "pending":
        return pendingReports
      case "reviewed":
        return reviewedReports
      case "all":
        return allReports
      default:
        return pendingReports
    }
  }, [activeTab, pendingReports, reviewedReports, allReports])

  function handleReview(reportId: string, action: "APPROVE" | "REJECT") {
    setReviewDialog({ reportId, action })
    setNotes("")
  }

  async function submitReview() {
    if (!reviewDialog) return
    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/reports/${reviewDialog.reportId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: reviewDialog.action,
            notes: notes || undefined,
          }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || "Failed to submit review")
        return
      }

      setReviewDialog(null)
      router.refresh()
    } catch {
      alert("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Admin Review
          </h1>
          <p className="text-muted-foreground">
            Review and approve reports before they are sent to clients
          </p>
        </div>
        {pendingReports.length > 0 && (
          <Badge className="bg-yellow-100 text-yellow-700 text-sm px-3 py-1">
            {pendingReports.length} pending
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingReports.length})
          </TabsTrigger>
          <TabsTrigger value="reviewed">
            Reviewed ({reviewedReports.length})
          </TabsTrigger>
          <TabsTrigger value="all">All ({allReports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {displayedReports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                {activeTab === "pending" ? (
                  <>
                    <CheckCircle2 className="h-12 w-12 text-green-500/50" />
                    <p className="mt-4 text-lg font-medium">All caught up</p>
                    <p className="text-sm text-muted-foreground">
                      No reports pending review right now.
                    </p>
                  </>
                ) : (
                  <>
                    <FileText className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-lg font-medium">No reports found</p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayedReports.map((report) => (
                <ReviewCard
                  key={report.id}
                  report={report}
                  onReview={handleReview}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Confirmation Dialog */}
      <Dialog
        open={!!reviewDialog}
        onOpenChange={(open) => !open && setReviewDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "APPROVE"
                ? "Approve Report"
                : "Reject Report"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog?.action === "APPROVE"
                ? "This report will be marked as approved and can be delivered to the client."
                : "This report will be marked as rejected. You can add notes explaining why."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label
              htmlFor="review-notes"
              className="text-sm font-medium leading-none"
            >
              Notes {reviewDialog?.action === "REJECT" ? "(recommended)" : "(optional)"}
            </label>
            <textarea
              id="review-notes"
              className="mt-2 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder={
                reviewDialog?.action === "APPROVE"
                  ? "Any comments for the record..."
                  : "Explain what needs to be changed..."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialog(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={submitting}
              className={
                reviewDialog?.action === "APPROVE"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {submitting
                ? "Submitting..."
                : reviewDialog?.action === "APPROVE"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
