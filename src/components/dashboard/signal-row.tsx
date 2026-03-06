"use client"

import React from "react"
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SignalRowProps {
  name: string
  value: number
  maxValue?: number
  weight: number
  trend: "up" | "down" | "stable"
  className?: string
}

function getProgressColor(value: number, maxValue: number): string {
  const ratio = value / maxValue
  if (ratio <= 0.33) return "bg-emerald-500"
  if (ratio <= 0.66) return "bg-yellow-500"
  return "bg-red-500"
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  switch (trend) {
    case "up":
      return <ArrowUpRight className="h-4 w-4 text-red-500" />
    case "down":
      return <ArrowDownRight className="h-4 w-4 text-emerald-500" />
    case "stable":
      return <Minus className="h-4 w-4 text-muted-foreground" />
  }
}

export function SignalRow({
  name,
  value,
  maxValue = 100,
  weight,
  trend,
  className,
}: SignalRowProps) {
  const normalizedValue = Math.min((value / maxValue) * 100, 100)
  const colorClass = getProgressColor(value, maxValue)

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border px-4 py-3",
        className
      )}
    >
      {/* Signal name */}
      <span className="min-w-[140px] text-sm font-medium">{name}</span>

      {/* Progress bar */}
      <div className="relative flex-1">
        <Progress
          value={normalizedValue}
          className="h-2.5"
        />
        {/* Color overlay */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all",
            colorClass
          )}
          style={{
            width: `${normalizedValue}%`,
            height: "100%",
          }}
        />
      </div>

      {/* Value */}
      <span className="min-w-[40px] text-right text-sm font-semibold tabular-nums">
        {value}
      </span>

      {/* Weight badge */}
      <Badge variant="outline" className="min-w-[48px] justify-center text-xs">
        w:{weight}
      </Badge>

      {/* Trend */}
      <TrendIcon trend={trend} />
    </div>
  )
}
