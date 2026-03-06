"use client"

import React from "react"
import { format } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import {
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ReviewStatusBannerProps {
  status: string
  reviewedAt?: string | null
  reviewedByName?: string | null
  reviewNotes?: string | null
}

export function ReviewStatusBanner({
  status,
  reviewedAt,
  reviewedByName,
  reviewNotes,
}: ReviewStatusBannerProps) {
  if (!["PENDING_REVIEW", "APPROVED", "REJECTED"].includes(status)) {
    return null
  }

  const config = {
    PENDING_REVIEW: {
      icon: Clock,
      title: "Pending Admin Review",
      description: "This report is awaiting review before it can be sent to clients.",
      bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
      iconColor: "text-yellow-600 dark:text-yellow-400",
    },
    APPROVED: {
      icon: CheckCircle2,
      title: "Approved",
      description: "This report has been approved and is ready for delivery.",
      bg: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
      iconColor: "text-green-600 dark:text-green-400",
    },
    REJECTED: {
      icon: XCircle,
      title: "Rejected",
      description: "This report was rejected and needs revision before delivery.",
      bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
      iconColor: "text-red-600 dark:text-red-400",
    },
  }[status]!

  const Icon = config.icon

  return (
    <Card className={cn("border", config.bg)}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconColor)} />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{config.title}</p>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{config.description}</p>
            {reviewedAt && reviewedByName && (
              <p className="text-xs text-muted-foreground">
                Reviewed by {reviewedByName} on{" "}
                {format(new Date(reviewedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
            {reviewNotes && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md bg-background/50 p-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-sm">{reviewNotes}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
