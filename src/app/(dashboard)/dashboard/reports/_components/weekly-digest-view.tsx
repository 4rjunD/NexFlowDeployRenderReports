"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Loader2,
  Github,
  MessageSquare,
  Layers,
  CalendarDays,
  GitPullRequest,
  GitCommit,
  Eye,
  Users,
  Hash,
  BarChart3,
  Timer,
  Send,
  Sun,
  TrendingUp,
  Activity,
  CheckCircle2,
  Target,
  RefreshCw,
  AlertTriangle,
  Mail,
  MailOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ReviewStatusBanner } from "@/components/dashboard/review-status-banner"
import { ReportActions } from "@/components/dashboard/report-actions"

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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  GENERATED: "bg-emerald-100 text-emerald-700",
  PENDING_REVIEW: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  DELIVERED: "bg-blue-100 text-blue-700",
}

function numVal(val: unknown): number {
  if (typeof val === "number") return val
  if (typeof val === "string") return parseFloat(val) || 0
  return 0
}

function fmtNum(n: number, decimals = 1): string {
  if (n === 0) return "0"
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(decimals)
}

// ─── Narrative Renderer ──────────────────────────────────────────────────────
function NarrativeContent({ text }: { text: string }) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // Skip empty lines
    if (!trimmed) { i++; continue }

    // Callout blocks: :::callout-risk / :::callout-positive / :::callout-info
    if (trimmed.startsWith(":::callout-")) {
      const type = trimmed.includes("risk") ? "risk" : trimmed.includes("positive") ? "positive" : "info"
      const calloutLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== ":::") {
        calloutLines.push(lines[i])
        i++
      }
      i++ // skip closing :::
      const borderColor = type === "risk" ? "border-red-400 bg-red-50 dark:bg-red-950/20" : type === "positive" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" : "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
      elements.push(
        <div key={`callout-${elements.length}`} className={`border-l-4 ${borderColor} rounded-r-lg px-5 py-4 my-4`}>
          {calloutLines.map((l, j) => (
            <p key={j} className="text-sm leading-relaxed text-foreground/80">{renderInline(l.trim())}</p>
          ))}
        </div>
      )
      continue
    }

    // Skip standalone :::
    if (trimmed === ":::") { i++; continue }

    // Section headers
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-xl font-bold text-foreground mt-8 mb-3 first:mt-0 tracking-tight border-b pb-2">{trimmed.slice(3)}</h2>
      )
      i++; continue
    }
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-bold text-foreground mt-6 mb-2">{renderInline(trimmed.slice(4))}</h3>
      )
      i++; continue
    }
    if (trimmed.startsWith("**") && trimmed.endsWith("**") && !trimmed.includes("**:")) {
      elements.push(
        <h3 key={`h3b-${i}`} className="text-base font-bold text-foreground mt-6 mb-2">{trimmed.replace(/\*\*/g, "")}</h3>
      )
      i++; continue
    }

    // Numbered action items: 1. **Title** — ...
    const actionMatch = trimmed.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)/)
    if (actionMatch) {
      elements.push(
        <div key={`action-${i}`} className="flex items-start gap-4 rounded-xl border p-5 my-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm shrink-0">{actionMatch[1]}</div>
          <div>
            <p className="font-bold text-foreground">{actionMatch[2]}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{renderInline(actionMatch[3])}</p>
          </div>
        </div>
      )
      i++; continue
    }

    // "Action steps:" label
    if (trimmed.toLowerCase().startsWith("action steps")) {
      elements.push(
        <p key={`label-${i}`} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 mb-1 border-t pt-3">Action Steps</p>
      )
      i++; continue
    }

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <div key={`li-${i}`} className="flex gap-3 pl-1 py-0.5">
          <span className="text-muted-foreground/50 mt-1 text-xs shrink-0">●</span>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{renderInline(trimmed.slice(2))}</p>
        </div>
      )
      i++; continue
    }

    // Regular paragraphs
    elements.push(
      <p key={`p-${i}`} className="text-[15px] leading-[1.7] text-muted-foreground mb-3">{renderInline(trimmed)}</p>
    )
    i++
  }

  return <div>{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  // Process :::highlight[text] and **bold**
  const processed = text.replace(/:::highlight\[([^\]]+)\]/g, "%%HL%%$1%%/HL%%")
  const parts = processed.split(/(%%HL%%[^%]+%%\/HL%%|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith("%%HL%%") && part.endsWith("%%/HL%%")) {
      const inner = part.slice(6, -7)
      return <span key={i} className="bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-semibold text-amber-800 dark:text-amber-200">{inner}</span>
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// ─── Stat Block ──────────────────────────────────────────────────────────────
function StatBlock({
  value,
  label,
  icon: Icon,
  accent = "blue",
}: {
  value: string | number
  label: string
  icon: React.ElementType
  accent?: string
}) {
  const accentMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
    pink: "bg-pink-50 text-pink-600 dark:bg-pink-950 dark:text-pink-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
    gray: "bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400",
  }
  return (
    <div className="text-center p-4">
      <div className={cn("inline-flex rounded-xl p-2.5 mb-2", accentMap[accent] || accentMap.blue)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground">{typeof value === "number" ? fmtNum(value) : value}</p>
      <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</p>
    </div>
  )
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </section>
  )
}

// ─── GitHub ──────────────────────────────────────────────────────────────────
function GitHubSection({ data }: { data: any }) {
  if (!data) return null

  const repos: string[] = Array.isArray(data.repos) ? data.repos : []
  const totalCommits = numVal(typeof data.commits === "object" ? data.commits?.total : data.commits)
  const pr = typeof data.pullRequests === "object" ? data.pullRequests : {}
  const rev = typeof data.reviews === "object" ? data.reviews : {}
  const totalPRs = numVal(pr.opened || pr.total || data.pullRequests)
  const prMerged = numVal(pr.merged)
  const prClosed = numVal(pr.closed)
  const avgMergeTime = numVal(pr.avgMergeTimeHours)
  const totalReviews = numVal(rev.total || data.reviews)
  const avgTurnaround = numVal(rev.avgTurnaroundTimeHours)
  const reviewComments = numVal(rev.comments)
  const byAuthor: Record<string, number> = (typeof data.commits === "object" && data.commits?.byAuthor) || {}
  const openedByAuthor: Record<string, number> = pr.openedByAuthor || {}
  const mergedByAuthor: Record<string, number> = pr.mergedByAuthor || {}
  const byReviewer: Record<string, number> = rev.byReviewer || {}

  if (totalCommits === 0 && totalPRs === 0 && totalReviews === 0 && repos.length === 0) return null

  const stats = [
    totalCommits > 0 && { value: totalCommits, label: "Commits", icon: GitCommit, accent: "purple" },
    totalPRs > 0 && { value: totalPRs, label: "PRs Opened", icon: GitPullRequest, accent: "blue" },
    prMerged > 0 && { value: prMerged, label: "PRs Merged", icon: GitPullRequest, accent: "green" },
    totalReviews > 0 && { value: totalReviews, label: "Reviews", icon: Eye, accent: "orange" },
    avgMergeTime > 0 && { value: `${fmtNum(avgMergeTime)}h`, label: "Avg Merge Time", icon: Clock, accent: "amber" },
    avgTurnaround > 0 && { value: `${fmtNum(avgTurnaround)}h`, label: "Review Turnaround", icon: Timer, accent: "teal" },
  ].filter(Boolean) as { value: string | number; label: string; icon: React.ElementType; accent: string }[]

  return (
    <Section icon={Github} title="Development Activity">
      {stats.length > 0 && (
        <div className={cn("grid gap-0 divide-x rounded-lg border mb-6", stats.length <= 2 ? "grid-cols-2" : stats.length <= 3 ? "grid-cols-3" : stats.length <= 4 ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-6")}>
          {stats.map((s, i) => (
            <StatBlock key={i} {...s} />
          ))}
        </div>
      )}

      {Object.keys(byAuthor).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Commits by Author</p>
          <div className="space-y-2">
            {Object.entries(byAuthor)
              .sort(([, a], [, b]) => b - a)
              .map(([author, count]) => {
                const pct = totalCommits > 0 ? Math.round((count / totalCommits) * 100) : 0
                return (
                  <div key={author} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900 text-xs font-bold text-purple-700 dark:text-purple-300 shrink-0">
                      {author.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{author}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{count} commits ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {Object.keys(openedByAuthor).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">PR Activity by Author</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Author</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opened</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Merged</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set([...Object.keys(openedByAuthor), ...Object.keys(mergedByAuthor)])).map((author) => (
                  <tr key={author} className="border-b border-muted/50">
                    <td className="py-2 font-medium">{author}</td>
                    <td className="py-2 text-right text-muted-foreground">{openedByAuthor[author] || 0}</td>
                    <td className="py-2 text-right text-muted-foreground">{mergedByAuthor[author] || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(byReviewer).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Code Reviews by Reviewer</p>
          <div className="space-y-2">
            {Object.entries(byReviewer)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([reviewer, count]) => {
                const maxCount = Math.max(...Object.values(byReviewer) as number[], 1)
                const pct = Math.round(((count as number) / maxCount) * 100)
                return (
                  <div key={reviewer} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900 text-xs font-bold text-orange-700 dark:text-orange-300 shrink-0">
                      {reviewer.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{reviewer}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{count as number} reviews</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
          {reviewComments > 0 && (
            <p className="text-xs text-muted-foreground mt-2">{reviewComments} review comments total</p>
          )}
        </div>
      )}

      {repos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active Repositories ({repos.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {repos.slice(0, 12).map((repo, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted/70 rounded-md px-2.5 py-1.5 font-mono">
                {typeof repo === "string" ? repo : (repo as any)?.name || `repo-${i + 1}`}
              </span>
            ))}
            {repos.length > 12 && (
              <span className="text-xs text-muted-foreground self-center ml-1">+{repos.length - 12} more</span>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

// ─── Slack ───────────────────────────────────────────────────────────────────
function SlackSection({ data }: { data: any }) {
  if (!data) return null

  const totalMessages = numVal(data.totalMessages ?? data.messageCount)
  const totalChannels = numVal(data.totalChannels ?? data.channelCount)
  const activeChannels = numVal(data.activeChannels)
  const contributors = Array.isArray(data.topContributors) ? data.topContributors : []
  const messagesByDay: Record<string, number> = data.messagesByDay || {}

  if (totalMessages === 0 && totalChannels === 0 && contributors.length === 0) return null

  const stats = [
    totalMessages > 0 && { value: totalMessages, label: "Messages", icon: MessageSquare, accent: "pink" },
    totalChannels > 0 && { value: totalChannels, label: "Total Channels", icon: Hash, accent: "green" },
    activeChannels > 0 && { value: activeChannels, label: "Active Channels", icon: Activity, accent: "teal" },
  ].filter(Boolean) as { value: number; label: string; icon: React.ElementType; accent: string }[]

  const validContributors = contributors.filter((c: any) => numVal(c.messageCount || c.count) > 0)

  return (
    <Section icon={MessageSquare} title="Team Communication">
      {stats.length > 0 && (
        <div className={cn("grid gap-0 divide-x rounded-lg border mb-6", stats.length === 1 ? "grid-cols-1" : stats.length === 2 ? "grid-cols-2" : stats.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
          {stats.map((s, i) => (
            <StatBlock key={i} {...s} />
          ))}
        </div>
      )}

      {validContributors.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top Contributors</p>
          <div className="space-y-2">
            {validContributors.slice(0, 5).map((c: any, i: number) => {
              const name = String(c.displayName || c.name || c.user || c.userId || "Unknown")
              const count = numVal(c.messageCount || c.count)
              const maxCount = Math.max(...validContributors.map((x: any) => numVal(x.messageCount || x.count)), 1)
              const pct = Math.round((count / maxCount) * 100)
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900 text-xs font-bold text-pink-700 dark:text-pink-300 shrink-0">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{name}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{count} msgs</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-pink-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {Object.keys(messagesByDay).length > 0 && (() => {
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        const values = days.map(d => messagesByDay[d] || 0)
        const maxVal = Math.max(...values, 1)
        if (values.every(v => v === 0)) return null
        return (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Activity by Day</p>
            <div className="flex items-end gap-1.5 h-20">
              {days.map((day, i) => {
                const v = values[i]
                const h = Math.max(4, Math.round((v / maxVal) * 64))
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                      <div className={cn("w-full max-w-[28px] rounded-t transition-all", v > 0 ? "bg-pink-400/80" : "bg-muted")} style={{ height: h }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{day}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </Section>
  )
}

// ─── Linear ──────────────────────────────────────────────────────────────────
function LinearSection({ data }: { data: any }) {
  if (!data) return null

  const issues = data.issues || {}
  const completed = numVal(issues.completed ?? data.issuesCompleted ?? data.completedCount)
  const created = numVal(issues.created ?? data.issuesCreated ?? data.createdCount)
  const inProgress = numVal(issues.inProgress ?? data.inProgress)
  const total = numVal(issues.total ?? data.totalIssues)
  const canceled = numVal(issues.canceled)
  const byAssignee: Record<string, any> = issues.byAssignee || {}
  const byPriority: Record<string, number> = issues.byPriority || {}
  const byLabel: Record<string, number> = issues.byLabel || {}
  const cycles = data.cycles || {}
  const activeCycle = cycles.active || null
  const recentCycles = Array.isArray(cycles.recent) ? cycles.recent : []
  const teams = data.team || {}

  if (total === 0 && completed === 0 && created === 0) return null

  const stats = [
    total > 0 && { value: total, label: "Total Issues", icon: BarChart3, accent: "blue" },
    completed > 0 && { value: completed, label: "Completed", icon: CheckCircle2, accent: "green" },
    created > 0 && { value: created, label: "Created", icon: Target, accent: "purple" },
    inProgress > 0 && { value: inProgress, label: "In Progress", icon: Timer, accent: "amber" },
    canceled > 0 && { value: canceled, label: "Canceled", icon: BarChart3, accent: "red" },
  ].filter(Boolean) as { value: number; label: string; icon: React.ElementType; accent: string }[]

  return (
    <Section icon={Layers} title="Project Management">
      {stats.length > 0 && (
        <div className={cn("grid gap-0 divide-x rounded-lg border mb-6", stats.length <= 2 ? "grid-cols-2" : stats.length <= 3 ? "grid-cols-3" : stats.length <= 4 ? "grid-cols-4" : "grid-cols-5")}>
          {stats.map((s, i) => (
            <StatBlock key={i} {...s} />
          ))}
        </div>
      )}

      {activeCycle && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active Cycle</p>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">
                {String(activeCycle.name || `Cycle ${activeCycle.number || ""}`)}
              </span>
              <span className="text-sm font-semibold text-primary">
                {Math.round(numVal(activeCycle.progress) * 100)}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round(numVal(activeCycle.progress) * 100))}%` }} />
            </div>
            {activeCycle.issueBreakdown && (
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <span>{activeCycle.issueBreakdown.total} total</span>
                <span className="text-emerald-600">{activeCycle.issueBreakdown.completed} done</span>
                <span className="text-amber-600">{activeCycle.issueBreakdown.inProgress} active</span>
                <span>{activeCycle.issueBreakdown.backlog} backlog</span>
              </div>
            )}
          </div>
        </div>
      )}

      {Object.keys(byAssignee).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Workload by Assignee</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Done</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byAssignee).map(([name, stats]: [string, any]) => (
                  <tr key={name} className="border-b border-muted/50">
                    <td className="py-2 font-medium">{name}</td>
                    <td className="py-2 text-right text-muted-foreground">{stats.total}</td>
                    <td className="py-2 text-right text-emerald-600">{stats.completed}</td>
                    <td className="py-2 text-right text-amber-600">{stats.inProgress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(byPriority).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Issues by Priority</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byPriority)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([priority, count]) => (
                <div key={priority} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <span className="text-lg font-bold text-foreground">{count as number}</span>
                  <span className="text-xs text-muted-foreground">{priority}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {Object.keys(byLabel).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Labels</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(byLabel).map(([label, count]) => (
              <span key={label} className="inline-flex items-center gap-1 text-xs bg-muted/70 rounded-md px-2.5 py-1.5">
                {label}: {count as number}
              </span>
            ))}
          </div>
        </div>
      )}

      {numVal(teams.totalMembers) > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span><strong className="text-foreground">{numVal(teams.activeMembers)}</strong> active of {numVal(teams.totalMembers)} team members</span>
        </div>
      )}
    </Section>
  )
}

// ─── Calendar ────────────────────────────────────────────────────────────────
function CalendarSection({ data }: { data: any }) {
  if (!data) return null

  const meetings = data.meetings || {}
  const focusTime = data.focusTime || {}
  const frequency = data.frequency || {}

  const totalMeetings = numVal(meetings.total ?? data.totalMeetings)
  const meetingHours = numVal(meetings.totalHours ?? data.meetingHours)
  const avgPerWeek = numVal(meetings.avgPerWeek)
  const avgFocusHoursPerDay = numVal(typeof focusTime === "number" ? focusTime : focusTime.avgFocusHoursPerDay ?? data.focusHours)
  const longestFocusBlock = numVal(focusTime.longestFocusBlockHours)
  const byDay: Record<string, number> = meetings.byDay || {}

  if (totalMeetings === 0 && meetingHours === 0 && avgFocusHoursPerDay === 0) return null

  const stats = [
    totalMeetings > 0 && { value: totalMeetings, label: "Meetings", icon: CalendarDays, accent: "red" },
    meetingHours > 0 && { value: `${fmtNum(meetingHours)}h`, label: "Meeting Hours", icon: Clock, accent: "amber" },
    avgFocusHoursPerDay > 0 && { value: `${fmtNum(avgFocusHoursPerDay)}h`, label: "Avg Focus/Day", icon: Sun, accent: "teal" },
    longestFocusBlock > 0 && { value: `${fmtNum(longestFocusBlock)}h`, label: "Best Focus Block", icon: TrendingUp, accent: "green" },
  ].filter(Boolean) as { value: string | number; label: string; icon: React.ElementType; accent: string }[]

  const hasByDay = Object.keys(byDay).length > 0 && Object.values(byDay).some(v => v > 0)
  const meetingTypes = [
    numVal(frequency.recurring) > 0 && { label: "Recurring", count: frequency.recurring },
    numVal(frequency.oneOnOnes) > 0 && { label: "1:1s", count: frequency.oneOnOnes },
    numVal(frequency.groupMeetings) > 0 && { label: "Group", count: frequency.groupMeetings },
    numVal(frequency.allDayEvents) > 0 && { label: "All-Day", count: frequency.allDayEvents },
  ].filter(Boolean) as { label: string; count: number }[]

  return (
    <Section icon={CalendarDays} title="Time & Meetings">
      {stats.length > 0 && (
        <div className={cn("grid gap-0 divide-x rounded-lg border mb-6", stats.length === 1 ? "grid-cols-1" : stats.length === 2 ? "grid-cols-2" : stats.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
          {stats.map((s, i) => (
            <StatBlock key={i} {...s} />
          ))}
        </div>
      )}

      {hasByDay && (() => {
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        const values = days.map(d => byDay[d] || 0)
        const maxVal = Math.max(...values, 1)
        return (
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Meetings by Day</p>
            <div className="flex items-end gap-1.5 h-20">
              {days.map((day, i) => {
                const v = values[i]
                const h = Math.max(4, Math.round((v / maxVal) * 64))
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-medium text-foreground">{v > 0 ? v : ""}</span>
                    <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                      <div className={cn("w-full max-w-[28px] rounded-t transition-all", v > 0 ? "bg-red-400/80" : "bg-muted/50")} style={{ height: h }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{day}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {meetingTypes.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Meeting Breakdown</p>
          <div className="flex flex-wrap gap-3">
            {meetingTypes.map((t) => (
              <div key={t.label} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <span className="text-lg font-bold text-foreground">{t.count}</span>
                <span className="text-xs text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function WeeklyDigestView({
  report: initialReport,
  userRole,
}: {
  report: ReportData
  userRole?: string
}) {
  const router = useRouter()
  const [report, setReport] = useState(initialReport)
  const isGenerating = report.status === "GENERATED" && !report.generatedAt

  const pollForUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/${report.id}/status`)
      if (!res.ok) return
      const data = await res.json()
      if (data.status !== "GENERATED" || data.generatedAt) {
        router.refresh()
      }
    } catch {
      // ignore
    }
  }, [report.id, router])

  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(pollForUpdates, 2000)
    return () => clearInterval(interval)
  }, [isGenerating, pollForUpdates])

  const content = report.content || {}
  const integrationData = content.integrationData || {}
  const connectedSources: string[] = content.connectedSources || []

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Link */}
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      {/* ── Report Header ── */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Badge className={cn("text-xs font-medium", STATUS_COLORS[report.status] || "")}>
            {report.status.replace(/_/g, " ")}
          </Badge>
          {connectedSources.length > 0 && !isGenerating && (
            <div className="flex gap-1 ml-auto">
              {connectedSources.map((source: string) => (
                <Badge key={source} variant="outline" className="text-[10px] font-normal">
                  {source.replace("GOOGLE_", "").toLowerCase()}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
          {report.title}
        </h1>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {format(new Date(report.periodStart), "MMMM d")} &ndash;{" "}
            {format(new Date(report.periodEnd), "MMMM d, yyyy")}
          </span>
          {report.generatedAt && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {format(new Date(report.generatedAt), "MMM d 'at' h:mm a")}
            </span>
          )}
        </div>
      </header>

      {/* ── Generating State ── */}
      {isGenerating && (
        <div className="rounded-xl border-2 border-dashed border-yellow-300 bg-yellow-50/60 dark:border-yellow-700 dark:bg-yellow-950/20 p-6 mb-8">
          <div className="flex items-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-yellow-600" />
            <div>
              <p className="font-semibold text-foreground">Generating your report...</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pulling live data from {connectedSources.length > 0 ? connectedSources.map(s => s.replace("GOOGLE_", "").toLowerCase()).join(", ") : "connected integrations"}. This takes 15-30 seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Actions ── */}
      {!isGenerating && (
        <div className="mb-6">
          <ReportActions
            reportId={report.id}
            status={report.status}
            userRole={userRole}
            aiNarrative={report.aiNarrative}
            summary={report.summary}
            orgId={(report as any).orgId}
          />
        </div>
      )}

      {/* ── Review Status ── */}
      <ReviewStatusBanner
        status={report.status}
        reviewedAt={report.reviewedAt}
        reviewedByName={report.reviewedByName}
        reviewNotes={report.reviewNotes}
      />

      {/* ── AI Executive Narrative ── */}
      {report.aiNarrative && !isGenerating && (
        <section className="rounded-xl border bg-card mb-8">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Executive Summary</h2>
          </div>
          <div className="px-6 py-6">
            <NarrativeContent text={report.aiNarrative} />
          </div>
        </section>
      )}

      {/* ── Integration Data Sections ── */}
      {!isGenerating && (
        <div className="space-y-6 mb-8">
          <GitHubSection data={integrationData.github} />
          <SlackSection data={integrationData.slack} />
          <LinearSection data={integrationData.linear} />
          <CalendarSection data={integrationData.googleCalendar} />
        </div>
      )}

      {/* ── Delivery History ── */}
      {report.deliveries.length > 0 && (
        <DeliveryHistorySection deliveries={report.deliveries} reportId={report.id} userRole={userRole} />
      )}
    </div>
  )
}

// ── Delivery History with per-recipient status tracking + resend ──

const DELIVERY_STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  PENDING: { color: "bg-yellow-100 text-yellow-700", icon: Clock, label: "Pending" },
  SENT: { color: "bg-emerald-100 text-emerald-700", icon: Mail, label: "Sent" },
  DELIVERED: { color: "bg-blue-100 text-blue-700", icon: CheckCircle2, label: "Delivered" },
  BOUNCED: { color: "bg-red-100 text-red-700", icon: AlertTriangle, label: "Bounced" },
  FAILED: { color: "bg-red-100 text-red-700", icon: AlertTriangle, label: "Failed" },
}

function DeliveryHistorySection({ deliveries, reportId, userRole }: { deliveries: any[]; reportId: string; userRole?: string }) {
  const router = useRouter()
  const [resending, setResending] = useState<Set<string>>(new Set())
  const [resendAllLoading, setResendAllLoading] = useState(false)
  const [resendResult, setResendResult] = useState<string | null>(null)

  const failedDeliveries = deliveries.filter((d) => d.status === "FAILED" || d.status === "BOUNCED")
  const isAdmin = userRole === "ADMIN"

  async function handleResendOne(deliveryId: string) {
    setResending((prev) => new Set(prev).add(deliveryId))
    try {
      const res = await fetch(`/api/reports/${reportId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryIds: [deliveryId] }),
      })
      const data = await res.json()
      if (res.ok) {
        setResendResult(`Resend: ${data.message}`)
        setTimeout(() => { setResendResult(null); router.refresh() }, 2000)
      } else {
        setResendResult(`Error: ${data.error}`)
      }
    } catch {
      setResendResult("Network error")
    } finally {
      setResending((prev) => { const next = new Set(prev); next.delete(deliveryId); return next })
    }
  }

  async function handleResendAllFailed() {
    setResendAllLoading(true)
    setResendResult(null)
    try {
      const res = await fetch(`/api/reports/${reportId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resendAllFailed: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setResendResult(data.message)
        setTimeout(() => { setResendResult(null); router.refresh() }, 2500)
      } else {
        setResendResult(`Error: ${data.error}`)
      }
    } catch {
      setResendResult("Network error")
    } finally {
      setResendAllLoading(false)
    }
  }

  // Summary stats
  const sent = deliveries.filter((d) => d.status === "SENT" || d.status === "DELIVERED").length
  const opened = deliveries.filter((d) => d.openedAt).length
  const bounced = deliveries.filter((d) => d.status === "BOUNCED").length
  const failed = deliveries.filter((d) => d.status === "FAILED").length

  return (
    <section className="rounded-xl border bg-card mb-8">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <Send className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Delivery Status</h2>
        </div>
        {isAdmin && failedDeliveries.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleResendAllFailed}
            disabled={resendAllLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", resendAllLoading && "animate-spin")} />
            {resendAllLoading ? "Resending..." : `Resend ${failedDeliveries.length} Failed`}
          </Button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Summary bar */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-muted-foreground">{sent} sent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MailOpen className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-muted-foreground">{opened} opened</span>
          </div>
          {bounced > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-red-600">{bounced} bounced</span>
            </div>
          )}
          {failed > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-red-600">{failed} failed</span>
            </div>
          )}
        </div>

        {resendResult && (
          <p className={cn("text-xs rounded-md px-3 py-2",
            resendResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          )}>{resendResult}</p>
        )}

        {/* Per-recipient rows */}
        <div className="space-y-2">
          {deliveries.map((delivery: any) => {
            const statusConfig = DELIVERY_STATUS_CONFIG[delivery.status] || DELIVERY_STATUS_CONFIG.PENDING
            const StatusIcon = statusConfig.icon
            const isFailed = delivery.status === "FAILED" || delivery.status === "BOUNCED"
            const isResending = resending.has(delivery.id)

            return (
              <div key={delivery.id} className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-3",
                isFailed && "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/10"
              )}>
                <div className="flex items-center gap-3 min-w-0">
                  <StatusIcon className={cn("h-4 w-4 flex-shrink-0",
                    delivery.status === "SENT" || delivery.status === "DELIVERED" ? "text-emerald-600" :
                    isFailed ? "text-red-500" : "text-yellow-500"
                  )} />
                  <Badge variant="outline" className="text-xs flex-shrink-0">{delivery.channel}</Badge>
                  <div className="min-w-0">
                    <span className="text-sm truncate block">{delivery.recipientName ?? delivery.recipientEmail ?? "Unknown"}</span>
                    {delivery.recipientEmail && delivery.recipientName && (
                      <span className="text-[11px] text-muted-foreground truncate block">{delivery.recipientEmail}</span>
                    )}
                  </div>
                  {delivery.recipientRole && (
                    <Badge variant="outline" className="text-[10px] px-1.5 flex-shrink-0">{delivery.recipientRole.replace(/_/g, " ")}</Badge>
                  )}
                  {delivery.reportDepth && (
                    <Badge variant="outline" className="text-[10px] px-1.5 flex-shrink-0">{delivery.reportDepth}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Open tracking indicator */}
                  {delivery.openedAt && (
                    <div className="flex items-center gap-1" title={`Opened ${format(new Date(delivery.openedAt), "MMM d, h:mm a")} · ${delivery.viewCount || 1} view(s)`}>
                      <MailOpen className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-[10px] text-blue-600">{delivery.viewCount || 1}x</span>
                    </div>
                  )}
                  {/* Error tooltip */}
                  {delivery.error && (
                    <span className="text-[10px] text-red-500 max-w-[140px] truncate" title={delivery.error}>{delivery.error}</span>
                  )}
                  <Badge className={cn("text-xs", statusConfig.color)}>
                    {statusConfig.label}
                    {delivery.sentAt && ` · ${format(new Date(delivery.sentAt), "MMM d, h:mm a")}`}
                  </Badge>
                  {/* Resend button for failed */}
                  {isAdmin && isFailed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleResendOne(delivery.id)}
                      disabled={isResending}
                    >
                      <RefreshCw className={cn("h-3 w-3 mr-1", isResending && "animate-spin")} />
                      {isResending ? "..." : "Retry"}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
