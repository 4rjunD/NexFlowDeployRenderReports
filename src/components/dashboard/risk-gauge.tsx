"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface RiskGaugeProps {
  value: number
  label?: string
  size?: number
  className?: string
}

function getColor(value: number): string {
  if (value <= 30) return "#10B981"
  if (value <= 60) return "#F59E0B"
  return "#EF4444"
}

export function RiskGauge({
  value,
  label,
  size = 200,
  className,
}: RiskGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value))
  const color = getColor(clampedValue)

  // SVG arc geometry for a semi-circle gauge
  const strokeWidth = size * 0.1
  const radius = (size - strokeWidth) / 2
  const centerX = size / 2
  const centerY = size / 2 + radius * 0.1

  // Arc from 180deg (left) to 0deg (right) -- a bottom-opening semicircle
  const startAngle = Math.PI // 180 degrees
  const endAngle = 0 // 0 degrees
  const sweepAngle = startAngle - endAngle

  // Background arc path (full semicircle)
  const bgStartX = centerX + radius * Math.cos(startAngle)
  const bgStartY = centerY - radius * Math.sin(startAngle)
  const bgEndX = centerX + radius * Math.cos(endAngle)
  const bgEndY = centerY - radius * Math.sin(endAngle)

  const bgArcPath = `M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`

  // Value arc path (proportional)
  const valueAngle = startAngle - (clampedValue / 100) * sweepAngle
  const valueEndX = centerX + radius * Math.cos(valueAngle)
  const valueEndY = centerY - radius * Math.sin(valueAngle)
  const largeArcFlag = clampedValue > 50 ? 1 : 0

  const valueArcPath = `M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${valueEndX} ${valueEndY}`

  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center", className)}
    >
      <svg
        width={size}
        height={size * 0.65}
        viewBox={`0 0 ${size} ${size * 0.65}`}
        className="overflow-visible"
      >
        {/* Background track */}
        <path
          d={bgArcPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        {clampedValue > 0 && (
          <path
            d={valueArcPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Center value text */}
        <text
          x={centerX}
          y={centerY - radius * 0.15}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground"
          fontSize={size * 0.22}
          fontWeight="bold"
        >
          {clampedValue}
        </text>
      </svg>

      {label && (
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {label}
        </p>
      )}
    </div>
  )
}
