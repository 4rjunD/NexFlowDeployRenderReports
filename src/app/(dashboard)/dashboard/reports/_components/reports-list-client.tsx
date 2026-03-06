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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Calendar, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportItem {
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
}

interface ReportsListClientProps {
  reports: ReportItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<
  ReportItem["type"],
  { label: string; color: string; filterKey: string }
> = {
  WEEKLY_DIGEST: {
    label: "Weekly Digest",
    color: "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300",
    filterKey: "weekly",
  },
  SPRINT_RISK: {
    label: "Sprint Risk",
    color: "bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900 dark:text-orange-300",
    filterKey: "sprint",
  },
  MONTHLY_HEALTH: {
    label: "Monthly Health",
    color: "bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300",
    filterKey: "monthly",
  },
}

const STATUS_CONFIG: Record<ReportItem["status"], { label: string; color: string }> = {
  DRAFT: {
    label: "Draft",
    color: "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  },
  GENERATED: {
    label: "Generated",
    color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300",
  },
  PENDING_REVIEW: {
    label: "Pending Review",
    color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300",
  },
  APPROVED: {
    label: "Approved",
    color: "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900 dark:text-green-300",
  },
  REJECTED: {
    label: "Rejected",
    color: "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900 dark:text-red-300",
  },
  DELIVERED: {
    label: "Delivered",
    color: "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300",
  },
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + "..."
}

// ---------------------------------------------------------------------------
// Report Card Component
// ---------------------------------------------------------------------------

function ReportCard({ report }: { report: ReportItem }) {
  const typeConfig = TYPE_CONFIG[report.type]
  const statusConfig = STATUS_CONFIG[report.status]

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs", typeConfig.color)}>
            {typeConfig.label}
          </Badge>
          <Badge className={cn("text-xs", statusConfig.color)}>
            {statusConfig.label}
          </Badge>
        </div>
        <CardTitle className="mt-2 text-lg leading-tight">
          {report.title}
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {report.orgName && (
            <span className="font-medium text-foreground">{report.orgName} —</span>
          )}
          {format(new Date(report.periodStart), "MMM d")} -{" "}
          {format(new Date(report.periodEnd), "MMM d, yyyy")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        {report.summary ? (
          <p className="text-sm text-muted-foreground">
            {truncate(report.summary, 100)}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No summary available
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4">
        <span className="text-xs text-muted-foreground">
          {report.generatedAt
            ? `Generated ${format(new Date(report.generatedAt), "MMM d, yyyy 'at' h:mm a")}`
            : `Created ${format(new Date(report.createdAt), "MMM d, yyyy")}`}
        </span>
        <Link
          href={`/dashboard/reports/${report.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View Report
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ReportsListClient({ reports }: ReportsListClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("all")

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, 5000)
    return () => clearInterval(interval)
  }, [router])

  const filteredReports = useMemo(() => {
    if (activeTab === "all") return reports
    return reports.filter((r) => TYPE_CONFIG[r.type].filterKey === activeTab)
  }, [reports, activeTab])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            AI-generated insights and team intelligence reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {reports.length} total reports
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            All ({reports.length})
          </TabsTrigger>
          <TabsTrigger value="weekly">
            Weekly Digest (
            {reports.filter((r) => r.type === "WEEKLY_DIGEST").length})
          </TabsTrigger>
          <TabsTrigger value="sprint">
            Sprint Risk (
            {reports.filter((r) => r.type === "SPRINT_RISK").length})
          </TabsTrigger>
          <TabsTrigger value="monthly">
            Monthly Health (
            {reports.filter((r) => r.type === "MONTHLY_HEALTH").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredReports.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-lg font-medium">No reports found</p>
                <p className="text-sm text-muted-foreground">
                  Reports will appear here once they are generated.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
