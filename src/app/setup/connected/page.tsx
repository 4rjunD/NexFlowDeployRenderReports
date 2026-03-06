"use client"

import { useSearchParams } from "next/navigation"
import { Check, XCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function ConnectedPage() {
  const params = useSearchParams()
  const service = params?.get("service") || "Service"
  const error = params?.get("error")

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Connection Failed</h2>
            <p className="text-muted-foreground text-center text-sm">{error}</p>
            <p className="text-muted-foreground text-center text-xs">You can close this tab and try again.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold">{service} Connected</h2>
          <p className="text-muted-foreground text-center text-sm">You can close this tab and return to the setup page.</p>
        </CardContent>
      </Card>
    </div>
  )
}
