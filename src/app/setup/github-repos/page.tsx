"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

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

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5",
  Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", Ruby: "#701516",
  Swift: "#F05138", Kotlin: "#A97BFF", "C#": "#178600", C: "#555555",
  "C++": "#f34b7d", PHP: "#4F5D95",
}

export default function GitHubRepoSelectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgId = searchParams?.get("orgId") || ""
  const returnTo = searchParams?.get("returnTo") || ""

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!orgId) { setError("Missing organization ID"); setLoading(false); return }
    async function load() {
      try {
        const res = await fetch(`/api/integrations/github/repos?orgId=${orgId}`)
        if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to load"); return }
        const data = await res.json()
        setRepos(data.repos)
        if (data.selectedRepos?.length > 0) {
          setSelected(new Set(data.selectedRepos))
        } else {
          setSelected(new Set(data.repos.slice(0, 15).map((r: Repo) => r.fullName)))
        }
      } catch { setError("Failed to load repositories") }
      finally { setLoading(false) }
    }
    load()
  }, [orgId])

  function toggleRepo(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
  }

  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/integrations/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, selectedRepos: Array.from(selected) }),
      })
      if (!res.ok) { setError("Failed to save selection"); return }
      setSaved(true)
      setTimeout(() => {
        window.close()
        // fallback if window.close() didn't work
        setTimeout(() => { if (returnTo) router.push(returnTo) }, 500)
      }, 1200)
    } catch { setError("Failed to save selection") }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes checkDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .repo-scroll::-webkit-scrollbar { width: 6px; }
        .repo-scroll::-webkit-scrollbar-track { background: transparent; }
        .repo-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .repo-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

      <div className="mx-auto max-w-2xl px-6 py-12" style={{ animation: "fadeUp 0.5s ease" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.08]">
            <svg className="h-5 w-5 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Select Repositories</h1>
            <p className="text-sm text-white/40">Choose which repos NexFlow should analyze</p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <svg className="h-6 w-6 text-emerald-400" style={{ animation: "spin 1s linear infinite" }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="mt-4 text-sm text-white/40">Loading repositories...</p>
          </div>
        )}

        {/* Error */}
        {error && repos.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
            </div>
            <p className="text-white/50 text-sm">{error}</p>
          </div>
        )}

        {/* Saved celebration */}
        {saved && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 24, strokeDashoffset: 24, animation: "checkDraw 0.4s ease 0.2s forwards" }} />
              </svg>
            </div>
            <div className="text-center" style={{ animation: "fadeUp 0.4s ease 0.4s both" }}>
              <p className="text-white font-medium">{selected.size} repos configured</p>
              <p className="text-white/40 text-sm mt-1">Returning to setup...</p>
            </div>
          </div>
        )}

        {/* Repo selector */}
        {!loading && repos.length > 0 && !saved && (
          <div className="mt-6 space-y-4">
            {/* Search + actions */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                />
              </div>
              <button onClick={() => setSelected(new Set(filteredRepos.map((r) => r.fullName)))} className="px-3 py-2.5 text-xs font-medium text-white/50 hover:text-white/80 border border-white/[0.08] rounded-lg hover:bg-white/[0.04] transition-colors">All</button>
              <button onClick={() => setSelected(new Set())} className="px-3 py-2.5 text-xs font-medium text-white/50 hover:text-white/80 border border-white/[0.08] rounded-lg hover:bg-white/[0.04] transition-colors">Clear</button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-white/40">{selected.size} of {repos.length} selected</span>
              {error && <span className="text-sm text-red-400">{error}</span>}
            </div>

            {/* Repo list */}
            <div className="max-h-[440px] overflow-y-auto repo-scroll space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              {filteredRepos.map((repo) => {
                const isSelected = selected.has(repo.fullName)
                const pushed = new Date(repo.pushedAt)
                const daysAgo = Math.floor((Date.now() - pushed.getTime()) / (1000 * 60 * 60 * 24))
                const langColor = repo.language ? LANG_COLORS[repo.language] || "#6b7280" : null

                return (
                  <button
                    key={repo.id}
                    onClick={() => toggleRepo(repo.fullName)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
                      isSelected
                        ? "bg-emerald-500/[0.08] border border-emerald-500/20"
                        : "hover:bg-white/[0.04] border border-transparent"
                    )}
                  >
                    <div className={cn(
                      "flex h-4.5 w-4.5 items-center justify-center rounded border flex-shrink-0 transition-all duration-150",
                      isSelected ? "bg-emerald-500 border-emerald-500" : "border-white/20"
                    )} style={{ width: 18, height: 18 }}>
                      {isSelected && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white/90 truncate">{repo.fullName}</span>
                        {repo.private ? (
                          <svg className="h-3 w-3 text-white/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                        ) : (
                          <svg className="h-3 w-3 text-white/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-xs text-white/30 truncate mt-0.5">{repo.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {langColor && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: langColor }} />
                          <span className="text-xs text-white/35">{repo.language}</span>
                        </div>
                      )}
                      <span className="text-xs text-white/25 whitespace-nowrap">
                        {daysAgo === 0 ? "today" : daysAgo === 1 ? "1d" : `${daysAgo}d`}
                      </span>
                    </div>
                  </button>
                )
              })}
              {filteredRepos.length === 0 && (
                <div className="py-12 text-center text-sm text-white/30">No repositories match your search</div>
              )}
            </div>

            {/* Save */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={selected.size === 0 || saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
              >
                {saving ? (
                  <>
                    <svg className="h-4 w-4" style={{ animation: "spin 1s linear infinite" }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Saving...
                  </>
                ) : (
                  <>Save Selection<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 12h14m-7-7 7 7-7 7" /></svg></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
