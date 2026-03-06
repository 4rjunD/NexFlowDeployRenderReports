"use client"

import React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface PipelineStage {
  name: string
  avgTime: string
  count: number
  color: string
}

interface FlowPipelineProps {
  stages: PipelineStage[]
  className?: string
}

export function FlowPipeline({ stages, className }: FlowPipelineProps) {
  const totalCount = stages.reduce((sum, stage) => sum + stage.count, 0)

  return (
    <div className={cn("flex w-full items-center gap-1", className)}>
      {stages.map((stage, index) => {
        // Proportional width, with a minimum so stages are always visible
        const proportion = totalCount > 0 ? stage.count / totalCount : 1 / stages.length
        const minWidthPercent = 12
        const availablePercent = 100 - minWidthPercent * stages.length
        const widthPercent = minWidthPercent + availablePercent * proportion

        return (
          <React.Fragment key={stage.name}>
            {/* Stage block */}
            <div
              className="flex flex-col items-center justify-center rounded-lg px-3 py-4 text-center transition-shadow hover:shadow-md"
              style={{
                backgroundColor: stage.color,
                width: `${widthPercent}%`,
                minWidth: "80px",
              }}
            >
              <span className="text-xs font-semibold text-white drop-shadow-sm">
                {stage.name}
              </span>
              <span className="mt-1 text-lg font-bold text-white drop-shadow-sm">
                {stage.count}
              </span>
              <span className="text-[10px] text-white/80">
                avg {stage.avgTime}
              </span>
            </div>

            {/* Arrow connector between stages */}
            {index < stages.length - 1 && (
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
