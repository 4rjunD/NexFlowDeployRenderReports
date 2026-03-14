"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { cn } from "@/lib/utils"
import Image from "next/image"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingData {
  clientName: string
  email: string
  companyName: string
  orgId: string
  connectedIntegrations: string[]
  allIntegrations: { type: string; status: string }[]
}

interface Repo {
  id: number
  fullName: string
  name: string
  owner: string
  private: boolean
  language: string | null
  description: string | null
  pushedAt: string
}

type Step = "welcome" | "connect" | "context" | "launch"
const STEPS: Step[] = ["welcome", "connect", "context", "launch"]

// ---------------------------------------------------------------------------
// Integration definitions
// ---------------------------------------------------------------------------

const INTEGRATIONS = [
  {
    type: "GITHUB",
    name: "GitHub",
    description: "Pull requests, commits, reviews, and CI data",
    route: "github",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    type: "SLACK",
    name: "Slack",
    description: "Team communication and async patterns",
    route: "slack",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
  },
  {
    type: "JIRA",
    name: "Jira",
    description: "Issues, sprints, and project tracking",
    route: "jira",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23 .262H11.443a5.217 5.217 0 0 0 5.214 5.215h2.129v2.057A5.217 5.217 0 0 0 24 12.749V1.263A1.001 1.001 0 0 0 23 .262z" />
      </svg>
    ),
  },
  {
    type: "LINEAR",
    name: "Linear",
    description: "Issue and cycle tracking",
    route: "linear",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.77 17.726a.857.857 0 0 1-.248-.608V6.882c0-.228.09-.447.248-.608l3.504-3.504a.857.857 0 0 1 .608-.248h10.236c.228 0 .447.09.608.248l3.504 3.504c.16.161.248.38.248.608v10.236a.857.857 0 0 1-.248.608l-3.504 3.504a.857.857 0 0 1-.608.248H6.882a.857.857 0 0 1-.608-.248L2.77 17.726zM12 17.143a5.143 5.143 0 1 0 0-10.286 5.143 5.143 0 0 0 0 10.286z" />
      </svg>
    ),
  },
  {
    type: "GOOGLE_CALENDAR",
    name: "Google Calendar",
    description: "Meeting load and focus time analysis",
    route: "google",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.5 3h-3V1.5H15V3H9V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm0 16.5h-15V8.25h15v11.25zM7.5 9.75h3v3h-3v-3zm4.5 0h3v3h-3v-3z" />
      </svg>
    ),
  },
]

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
  Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", Ruby: "#701516",
  Swift: "#F05138", Kotlin: "#A97BFF", "C#": "#178600",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const params = useParams()
  const token = (params?.token ?? "") as string

  // Core state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null)

  // Step wizard
  const [step, setStep] = useState<Step>("welcome")
  const [direction, setDirection] = useState<"forward" | "back">("forward")

  // Integration celebration
  const prevConnectedRef = useRef<Set<string>>(new Set())
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [justConnected, setJustConnected] = useState<Set<string>>(new Set())

  // GitHub repos (inline)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [reposLoading, setReposLoading] = useState(false)
  const [reposSaved, setReposSaved] = useState(false)
  const [repoSearch, setRepoSearch] = useState("")
  const [showRepos, setShowRepos] = useState(false)

  // Context
  const [context, setContext] = useState("")
  const [contextSaved, setContextSaved] = useState(false)
  const [savingContext, setSavingContext] = useState(false)

  // Report
  const [requestingReport, setRequestingReport] = useState(false)
  const [reportRequested, setReportRequested] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // BroadcastChannel — auto-close duplicate tabs from OAuth redirects
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!token) return
    const isOriginal = sessionStorage.getItem(`nf-setup-${token}`)
    if (!isOriginal) {
      sessionStorage.setItem(`nf-setup-${token}`, "1")
    }
    const channel = new BroadcastChannel(`nf-setup-${token}`)
    if (isOriginal) {
      // Original tab: respond to checks
      channel.onmessage = (e) => {
        if (e.data === "check") channel.postMessage("exists")
      }
    } else {
      // New tab (from OAuth redirect): check if original exists
      channel.postMessage("check")
      channel.onmessage = (e) => {
        if (e.data === "exists") {
          window.close()
        }
      }
      // If no response in 1s, we ARE the original
      setTimeout(() => sessionStorage.setItem(`nf-setup-${token}`, "1"), 1000)
    }
    return () => channel.close()
  }, [token])

  // -------------------------------------------------------------------------
  // Fetch onboarding data
  // -------------------------------------------------------------------------
  const fetchOnboardingData = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true)
      const res = await fetch(`/api/setup/${token}`)
      const data = await res.json()

      if (!res.ok) {
        if (data.expired) { setExpired(true); setError("This setup link has expired.") }
        else if (data.completed) { setCompleted(true); setError("Setup already completed.") }
        else setError(data.error || "Invalid setup link")
        return
      }

      // Detect newly connected integrations
      const newConnected = new Set<string>(data.connectedIntegrations || [])
      const prev = prevConnectedRef.current
      if (isRefresh && prev.size > 0) {
        for (const type of Array.from(newConnected)) {
          if (!prev.has(type)) {
            setCelebrating(type)
            setJustConnected((s) => new Set(s).add(type))
            setTimeout(() => setCelebrating(null), 3000)
          }
        }
      }
      prevConnectedRef.current = newConnected

      setOnboardingData(data)
      setError(null)

      // Load GitHub repos if connected
      if (newConnected.has("GITHUB") && repos.length === 0) {
        loadRepos(data.orgId)
      }

      // Load existing preferences
      if (!isRefresh) {
        try {
          const prefRes = await fetch(`/api/org/preferences?orgId=${data.orgId}`)
          if (prefRes.ok) {
            const existingPrefs = await prefRes.json()
            if (existingPrefs?.customContext) {
              setContext(existingPrefs.customContext)
              setContextSaved(true)
            }
          }
        } catch { /* optional */ }
      }
    } catch {
      if (!isRefresh) setError("Failed to load setup data.")
    } finally {
      setLoading(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchOnboardingData() }, [fetchOnboardingData])

  useEffect(() => {
    function handleFocus() {
      if (!error && !completed && !reportRequested) {
        fetchOnboardingData(true)
      }
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [fetchOnboardingData, error, completed, reportRequested])

  // -------------------------------------------------------------------------
  // GitHub repos
  // -------------------------------------------------------------------------
  async function loadRepos(orgId: string) {
    setReposLoading(true)
    try {
      const res = await fetch(`/api/integrations/github/repos?orgId=${orgId}`)
      if (res.ok) {
        const data = await res.json()
        setRepos(data.repos || [])
        if (data.selectedRepos?.length > 0) {
          setSelectedRepos(new Set(data.selectedRepos))
          setReposSaved(true)
        } else {
          setSelectedRepos(new Set((data.repos || []).slice(0, 15).map((r: Repo) => r.fullName)))
        }
      }
    } catch { /* ignore */ }
    finally { setReposLoading(false) }
  }

  function toggleRepo(fullName: string) {
    setSelectedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
    setReposSaved(false)
  }

  async function saveRepos() {
    if (!onboardingData) return
    try {
      const res = await fetch("/api/integrations/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: onboardingData.orgId, selectedRepos: Array.from(selectedRepos) }),
      })
      if (res.ok) setReposSaved(true)
    } catch { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  function handleConnect(integrationType: string) {
    const routeMap: Record<string, string> = {
      GITHUB: "github", SLACK: "slack", JIRA: "jira",
      LINEAR: "linear", GOOGLE_CALENDAR: "google",
    }
    const routePath = routeMap[integrationType] || integrationType.toLowerCase()
    window.open(`/api/integrations/${routePath}/connect?onboarding=${token}`, "_blank")
  }

  async function handleSaveContext() {
    if (!onboardingData) return
    setSavingContext(true)
    try {
      await fetch("/api/org/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: onboardingData.orgId, preferences: { customContext: context } }),
      })
      setContextSaved(true)
    } catch { /* silent */ }
    finally { setSavingContext(false) }
  }

  async function handleRequestReport() {
    if (!onboardingData) return
    setRequestingReport(true)
    setReportError(null)
    if (!contextSaved && context) await handleSaveContext()
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WEEKLY_DIGEST", orgId: onboardingData.orgId }),
      })
      if (!res.ok) { const d = await res.json(); setReportError(d.error || "Failed"); return }
      setReportRequested(true)
      await fetch(`/api/setup/${token}`, { method: "POST" })
    } catch { setReportError("Network error. Please try again.") }
    finally { setRequestingReport(false) }
  }

  function goTo(s: Step) {
    setDirection(STEPS.indexOf(s) > STEPS.indexOf(step) ? "forward" : "back")
    setStep(s)
  }

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const connectedTypes = new Set(onboardingData?.connectedIntegrations || [])
  const hasAnyConnection = connectedTypes.size > 0
  const stepIndex = STEPS.indexOf(step)
  const progress = (stepIndex / (STEPS.length - 1)) * 100
  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(repoSearch.toLowerCase())
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-emerald-500/30">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes celebrateCard {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          40% { box-shadow: 0 0 20px 4px rgba(16,185,129,0.25); }
          100% { box-shadow: 0 0 8px 2px rgba(16,185,129,0.08); }
        }
        @keyframes checkDraw {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes ringPulse {
          0% { transform: scale(0.8); opacity: 0; }
          50% { opacity: 0.6; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .step-content { animation: fadeSlideIn 0.45s ease both; }
        .repo-scroll::-webkit-scrollbar { width: 5px; }
        .repo-scroll::-webkit-scrollbar-track { background: transparent; }
        .repo-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .repo-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>

      {/* ─── Loading ─── */}
      {loading && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Image src="/nexflow-logo.png" alt="NexFlow" width={40} height={40} className="invert brightness-200 opacity-60" style={{ animation: "float 2s ease-in-out infinite" }} />
            <div className="h-1 w-32 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500/0 via-emerald-500 to-emerald-500/0" style={{ backgroundSize: "200% 100%", animation: "shimmer 1.5s linear infinite" }} />
            </div>
          </div>
        </div>
      )}

      {/* ─── Error / Expired ─── */}
      {!loading && error && (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="text-center space-y-4 step-content">
            <div className="h-14 w-14 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">{expired ? "Link Expired" : completed ? "Already Completed" : "Invalid Link"}</h2>
            <p className="text-white/40 text-sm max-w-sm mx-auto">{error}</p>
          </div>
        </div>
      )}

      {/* ─── Report Requested (Final) ─── */}
      {!loading && !error && reportRequested && (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="text-center space-y-6 max-w-md" style={{ animation: "scaleIn 0.5s ease" }}>
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30" style={{ animation: "ringPulse 2s ease-out infinite" }} />
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/15" style={{ animation: "ringPulse 2s ease-out 0.5s infinite" }} />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
                <svg className="h-9 w-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: "checkDraw 0.5s ease 0.3s forwards" }} />
                </svg>
              </div>
            </div>
            <div style={{ animation: "fadeSlideIn 0.5s ease 0.5s both" }}>
              <h2 className="text-2xl font-semibold tracking-tight">Your Report is Being Generated</h2>
              <p className="text-white/40 mt-3 leading-relaxed">
                We&apos;re analyzing your engineering data with AI. Your first report will be delivered to{" "}
                <span className="text-white/70">{onboardingData?.email}</span> once reviewed.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] text-sm text-white/30" style={{ animation: "fadeSlideIn 0.5s ease 0.8s both" }}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              Reports typically arrive within 1-2 business days
            </div>
          </div>
        </div>
      )}

      {/* ─── Main Wizard ─── */}
      {!loading && !error && !reportRequested && onboardingData && (
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.04]">
            <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Image src="/nexflow-logo.png" alt="NexFlow" width={24} height={24} className="invert brightness-200" />
                <span className="text-sm font-semibold tracking-tight text-white/80">NexFlow</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    {i > 0 && <div className={cn("w-6 h-px transition-colors duration-500", i <= stepIndex ? "bg-emerald-500/50" : "bg-white/[0.08]")} />}
                    <button
                      onClick={() => { if (i <= stepIndex || (s === "connect" && step !== "welcome")) goTo(s) }}
                      disabled={i > stepIndex + 1}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-all duration-500",
                        i < stepIndex ? "bg-emerald-500 text-white" :
                        i === stepIndex ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                        "bg-white/[0.04] text-white/20 border border-white/[0.06]"
                      )}
                    >
                      {i < stepIndex ? (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        i + 1
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-[2px] bg-white/[0.03]">
              <div className="h-full bg-emerald-500/60 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 flex items-start justify-center px-6 py-12">
            <div className="w-full max-w-2xl">

              {/* ─── WELCOME ─── */}
              {step === "welcome" && (
                <div key="welcome" className="step-content text-center space-y-8 py-12">
                  <div className="inline-flex items-center justify-center">
                    <Image src="/nexflow-logo.png" alt="NexFlow" width={56} height={56} className="invert brightness-200 opacity-80" />
                  </div>
                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight">
                      Welcome, {onboardingData.clientName}
                    </h1>
                    <p className="text-white/40 text-lg max-w-md mx-auto leading-relaxed">
                      Let&apos;s set up <span className="text-white/70">{onboardingData.companyName}</span> on NexFlow in a few quick steps.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto pt-4">
                    {[
                      { num: "1", label: "Connect tools" },
                      { num: "2", label: "Add context" },
                      { num: "3", label: "Get your report" },
                    ].map((s, i) => (
                      <div key={i} className="text-center space-y-2" style={{ animation: `fadeSlideIn 0.4s ease ${0.3 + i * 0.1}s both` }}>
                        <div className="mx-auto h-10 w-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-sm font-medium text-white/40">{s.num}</div>
                        <p className="text-xs text-white/30">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => goTo("connect")}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold text-white transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    style={{ animation: "fadeSlideIn 0.4s ease 0.6s both" }}
                  >
                    Get Started
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
                  </button>
                </div>
              )}

              {/* ─── CONNECT ─── */}
              {step === "connect" && (
                <div key="connect" className="step-content space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Connect Your Tools</h2>
                    <p className="text-white/40 mt-1.5">The more you connect, the richer your reports.</p>
                  </div>

                  <div className="space-y-3">
                    {INTEGRATIONS.map((integration, i) => {
                      const isConnected = connectedTypes.has(integration.type)
                      const isCelebrating = celebrating === integration.type
                      const wasJustConnected = justConnected.has(integration.type)

                      return (
                        <div
                          key={integration.type}
                          style={{
                            animation: isCelebrating
                              ? "celebrateCard 1s ease forwards"
                              : `fadeSlideIn 0.35s ease ${i * 0.05}s both`,
                          }}
                          className={cn(
                            "flex items-center justify-between rounded-xl border p-4 transition-all duration-300",
                            isConnected
                              ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                              : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]"
                          )}
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
                              isConnected
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-white/[0.04] text-white/40"
                            )}>
                              {integration.icon}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white/90">{integration.name}</p>
                              <p className="text-xs text-white/30 mt-0.5">{integration.description}</p>
                            </div>
                          </div>

                          {isConnected ? (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 text-emerald-400">
                                {isCelebrating || wasJustConnected ? (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: "checkDraw 0.4s ease 0.2s forwards" }} />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                                )}
                                <span className="text-xs font-medium">Connected</span>
                              </div>
                              {integration.type === "GITHUB" && (
                                <button
                                  onClick={() => setShowRepos(!showRepos)}
                                  className="text-[11px] text-white/30 hover:text-white/60 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]"
                                >
                                  {showRepos ? "Hide repos" : reposSaved ? `${selectedRepos.size} repos` : "Select repos"}
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleConnect(integration.type)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/[0.1] text-xs font-medium text-white/60 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.04] transition-all duration-200"
                            >
                              Connect
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3" /></svg>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Inline GitHub Repo Selector */}
                  {connectedTypes.has("GITHUB") && showRepos && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4" style={{ animation: "fadeSlideIn 0.3s ease" }}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-white/80">Select Repositories</h3>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedRepos(new Set(filteredRepos.map((r) => r.fullName)))} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">All</button>
                          <span className="text-white/10">|</span>
                          <button onClick={() => setSelectedRepos(new Set())} className="text-[11px] text-white/30 hover:text-white/60 transition-colors">Clear</button>
                        </div>
                      </div>

                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                        <input
                          type="text"
                          placeholder="Search..."
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                        />
                      </div>

                      {reposLoading ? (
                        <div className="py-8 flex justify-center">
                          <svg className="h-5 w-5 text-emerald-400" style={{ animation: "spin 1s linear infinite" }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        </div>
                      ) : (
                        <>
                          <div className="max-h-[280px] overflow-y-auto repo-scroll space-y-0.5 rounded-lg border border-white/[0.04] p-1">
                            {filteredRepos.map((repo) => {
                              const isSelected = selectedRepos.has(repo.fullName)
                              const daysAgo = Math.floor((Date.now() - new Date(repo.pushedAt).getTime()) / (1000 * 60 * 60 * 24))
                              const langColor = repo.language ? LANG_COLORS[repo.language] || "#6b7280" : null
                              return (
                                <button
                                  key={repo.id}
                                  onClick={() => toggleRepo(repo.fullName)}
                                  className={cn(
                                    "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                                    isSelected ? "bg-emerald-500/[0.07] border border-emerald-500/15" : "hover:bg-white/[0.03] border border-transparent"
                                  )}
                                >
                                  <div className={cn("flex items-center justify-center rounded border flex-shrink-0 transition-all", isSelected ? "bg-emerald-500 border-emerald-500" : "border-white/15")} style={{ width: 16, height: 16 }}>
                                    {isSelected && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>}
                                  </div>
                                  <span className="text-xs text-white/70 truncate flex-1">{repo.fullName}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {langColor && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: langColor }} />}
                                    <span className="text-[10px] text-white/20">{daysAgo === 0 ? "today" : `${daysAgo}d`}</span>
                                  </div>
                                </button>
                              )
                            })}
                            {filteredRepos.length === 0 && <div className="py-6 text-center text-xs text-white/20">No results</div>}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/25">{selectedRepos.size} of {repos.length} selected</span>
                            <button
                              onClick={saveRepos}
                              disabled={selectedRepos.size === 0}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-xs font-medium text-emerald-400 disabled:opacity-30 transition-colors"
                            >
                              {reposSaved ? "Saved" : "Save Selection"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Connected count + Continue */}
                  <div className="flex items-center justify-between pt-4">
                    <button onClick={() => goTo("welcome")} className="text-sm text-white/30 hover:text-white/60 transition-colors">Back</button>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-white/25">
                        {connectedTypes.size} of {INTEGRATIONS.length} connected
                      </span>
                      <button
                        onClick={() => goTo("context")}
                        className={cn(
                          "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                          hasAnyConnection
                            ? "bg-emerald-500 hover:bg-emerald-400 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                            : "bg-white/[0.06] text-white/40 cursor-not-allowed"
                        )}
                        disabled={!hasAnyConnection}
                      >
                        Continue
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── CONTEXT ─── */}
              {step === "context" && (
                <div key="context" className="step-content space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Add Context</h2>
                    <p className="text-white/40 mt-1.5">Help our AI understand what your team is working on. This is optional but makes your report significantly better.</p>
                  </div>

                  <div className="space-y-3">
                    <textarea
                      rows={10}
                      value={context}
                      onChange={(e) => { setContext(e.target.value); setContextSaved(false) }}
                      placeholder={"Share anything that shapes your report:\n\n• Current deliverables and status\n• Sprint goals and deadlines\n• Team structure: who owns what\n• Known risks or blockers\n• Questions you want the report to answer"}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/10 resize-y min-h-[200px] transition-colors"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white/20">
                        {context.length > 0 ? `${context.length.toLocaleString()} characters` : "Paste from Notion, spreadsheets, or docs"}
                      </p>
                      {context.length > 0 && !contextSaved && (
                        <button onClick={handleSaveContext} disabled={savingContext} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                          {savingContext ? "Saving..." : "Save"}
                        </button>
                      )}
                      {contextSaved && context.length > 0 && (
                        <span className="text-xs text-emerald-400/60 flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                          Saved
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <button onClick={() => goTo("connect")} className="text-sm text-white/30 hover:text-white/60 transition-colors">Back</button>
                    <button
                      onClick={() => goTo("launch")}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-medium text-white transition-all duration-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    >
                      {context.length > 0 ? "Continue" : "Skip & Continue"}
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ─── LAUNCH ─── */}
              {step === "launch" && (
                <div key="launch" className="step-content space-y-8 py-4">
                  <div className="text-center space-y-3">
                    <h2 className="text-2xl font-semibold tracking-tight">Ready to Launch</h2>
                    <p className="text-white/40 max-w-md mx-auto">Review your setup and generate your first AI-powered engineering report.</p>
                  </div>

                  {/* Summary */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                    {INTEGRATIONS.map((integration) => {
                      const isConnected = connectedTypes.has(integration.type)
                      return (
                        <div key={integration.type} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={cn("text-xs", isConnected ? "text-emerald-400" : "text-white/15")}>
                              {integration.icon}
                            </div>
                            <span className={cn("text-sm", isConnected ? "text-white/80" : "text-white/25")}>{integration.name}</span>
                          </div>
                          {isConnected ? (
                            <div className="flex items-center gap-1.5 text-emerald-400">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                              <span className="text-xs font-medium">
                                {integration.type === "GITHUB" && reposSaved ? `${selectedRepos.size} repos` : "Connected"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-white/20">Not connected</span>
                          )}
                        </div>
                      )
                    })}
                    {context.length > 0 && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          <span className="text-sm text-white/80">Custom context</span>
                        </div>
                        <span className="text-xs text-emerald-400/60">{context.length.toLocaleString()} chars</span>
                      </div>
                    )}
                  </div>

                  {reportError && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-sm text-red-400 text-center">
                      {reportError}
                    </div>
                  )}

                  <div className="text-center space-y-4">
                    <button
                      onClick={handleRequestReport}
                      disabled={!hasAnyConnection || requestingReport}
                      className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-all duration-200 hover:shadow-[0_0_24px_rgba(16,185,129,0.35)]"
                    >
                      {requestingReport ? (
                        <>
                          <svg className="h-4 w-4" style={{ animation: "spin 1s linear infinite" }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Generating Report...
                        </>
                      ) : (
                        <>
                          Generate Your First Report
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </>
                      )}
                    </button>
                    <p className="text-xs text-white/20">
                      Your report will be delivered to {onboardingData.email}
                    </p>
                  </div>

                  <div className="flex items-center justify-start pt-2">
                    <button onClick={() => goTo("context")} className="text-sm text-white/30 hover:text-white/60 transition-colors">Back</button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
