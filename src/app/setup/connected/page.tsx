"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

export default function ConnectedPage() {
  const params = useSearchParams()
  const service = params?.get("service") || "Service"
  const error = params?.get("error")
  const [cannotClose, setCannotClose] = useState(false)

  useEffect(() => {
    if (error) return
    const timer = setTimeout(() => {
      window.close()
      // If we're still here after 500ms, window.close() didn't work
      setTimeout(() => setCannotClose(true), 500)
    }, 1800)
    return () => clearTimeout(timer)
  }, [error])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-4">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white">Connection Failed</h2>
          <p className="text-white/50 text-sm max-w-xs">{error}</p>
          <p className="text-white/30 text-xs">Close this tab and try again from the setup page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-4">
      <style>{`
        @keyframes ringPulse {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes checkDraw {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex flex-col items-center justify-center space-y-5 text-center">
        <div className="relative">
          {/* Pulse rings */}
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40" style={{ animation: "ringPulse 1.5s ease-out forwards" }} />
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400/20" style={{ animation: "ringPulse 1.5s ease-out 0.3s forwards" }} />
          {/* Checkmark circle */}
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
            <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline
                points="20 6 9 17 4 12"
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: 24,
                  animation: "checkDraw 0.4s ease 0.3s forwards",
                }}
              />
            </svg>
          </div>
        </div>
        <div style={{ animation: "fadeUp 0.4s ease 0.5s both" }}>
          <h2 className="text-lg font-semibold text-white">{service} Connected</h2>
          <p className="text-white/40 text-sm mt-1">
            {cannotClose ? "You can close this tab now." : "Returning to setup..."}
          </p>
        </div>
      </div>
    </div>
  )
}
