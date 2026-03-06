"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepperProps {
  steps: string[]
  currentStep: number
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center justify-center w-full">
      {steps.map((label, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isFuture = index > currentStep

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
                  isCompleted &&
                    "border-green-500 bg-green-500 text-white",
                  isCurrent &&
                    "border-primary bg-primary text-primary-foreground animate-pulse",
                  isFuture &&
                    "border-muted-foreground/30 bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  "mt-2 text-xs font-medium whitespace-nowrap",
                  isCompleted && "text-green-600",
                  isCurrent && "text-primary",
                  isFuture && "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>

            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-12 mx-2 mt-[-1.25rem] transition-colors",
                  index < currentStep
                    ? "bg-green-500"
                    : "bg-muted-foreground/30"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
