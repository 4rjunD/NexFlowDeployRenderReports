"use client"

import React from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface PRCardProps {
  title: string
  author: string
  age: string
  additions: number
  deletions: number
  labels: string[]
  reviewers: string[]
  status: string
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case "approved":
    case "merged":
      return "default"
    case "changes_requested":
    case "changes requested":
      return "destructive"
    case "review_required":
    case "review required":
    case "pending":
      return "secondary"
    default:
      return "outline"
  }
}

export function PRCard({
  title,
  author,
  age,
  additions,
  deletions,
  labels,
  reviewers,
  status,
  className,
}: PRCardProps) {
  return (
    <Card className={cn("w-full transition-shadow hover:shadow-md", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight">
            {title}
          </h3>
          <Badge variant={getStatusVariant(status)} className="shrink-0 text-xs">
            {status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Author and age */}
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {getInitials(author)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{author}</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {age}
          </Badge>
        </div>

        {/* Additions / Deletions */}
        <div className="flex items-center gap-3 text-sm font-mono">
          <span className="text-emerald-600">+{additions}</span>
          <span className="text-red-600">-{deletions}</span>
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        )}

        {/* Reviewers */}
        {reviewers.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">Reviewers:</span>
            <div className="flex -space-x-1">
              {reviewers.map((reviewer) => (
                <Avatar key={reviewer} className="h-6 w-6 border-2 border-background">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(reviewer)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
