"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ConnectionCardProps {
  name: string
  description: string
  icon: React.ReactNode
  connected: boolean
  onConnect: () => void
}

export function ConnectionCard({
  name,
  description,
  icon,
  connected,
  onConnect,
}: ConnectionCardProps) {
  return (
    <Card
      className={cn(
        "flex items-center gap-4 p-4 transition-colors",
        connected
          ? "border-green-500/50 bg-green-500/5"
          : "border-border hover:border-muted-foreground/50"
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          connected
            ? "bg-green-500/10 text-green-600"
            : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>

      {/* Action */}
      {connected ? (
        <Badge
          variant="secondary"
          className="bg-green-500/10 text-green-600 border-green-500/20 gap-1"
        >
          <Check className="h-3 w-3" />
          Connected
        </Badge>
      ) : (
        <Button variant="outline" size="sm" onClick={onConnect}>
          Connect
        </Button>
      )}
    </Card>
  )
}
