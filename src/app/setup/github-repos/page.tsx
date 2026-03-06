"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Github,
  Check,
  Loader2,
  Search,
  Lock,
  Globe,
  ArrowRight,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

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

export default function GitHubRepoSelectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgId = searchParams?.get("orgId") || ""
  const returnTo = searchParams?.get("returnTo") || ""

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!orgId) {
      setError("Missing organization ID")
      setLoading(false)
      return
    }

    async function load() {
      try {
        const res = await fetch(`/api/integrations/github/repos?orgId=${orgId}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Failed to load repositories")
          return
        }
        const data = await res.json()
        setRepos(data.repos)
        // Pre-select previously selected repos, or all if none saved
        if (data.selectedRepos && data.selectedRepos.length > 0) {
          setSelected(new Set(data.selectedRepos))
        } else {
          // Default: select top 15 most recently pushed
          setSelected(new Set(data.repos.slice(0, 15).map((r: Repo) => r.fullName)))
        }
      } catch {
        setError("Failed to load repositories")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [orgId])

  function toggleRepo(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) {
        next.delete(fullName)
      } else {
        next.add(fullName)
      }
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filteredRepos.map((r) => r.fullName)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/integrations/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          selectedRepos: Array.from(selected),
        }),
      })

      if (!res.ok) {
        setError("Failed to save selection")
        return
      }

      // Redirect back to setup or close
      if (returnTo) {
        router.push(returnTo)
      } else {
        window.close()
      }
    } catch {
      setError("Failed to save selection")
    } finally {
      setSaving(false)
    }
  }

  const filteredRepos = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(search.toLowerCase())
  )

  const langColors: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Go: "#00ADD8",
    Rust: "#dea584",
    Java: "#b07219",
    Ruby: "#701516",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    "C#": "#178600",
    C: "#555555",
    "C++": "#f34b7d",
    PHP: "#4F5D95",
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-3xl">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading repositories...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && repos.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-3xl">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            <CardTitle className="text-lg font-bold">Select Repositories</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose which repositories NexFlow should analyze for your engineering reports.
            We&apos;ll track PRs, commits, reviews, and code velocity across these repos.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 space-y-4">
          {/* Search + bulk actions */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Clear
            </Button>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{selected.size} of {repos.length} repositories selected</span>
            <Badge variant="outline">{repos.length} total</Badge>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Repo list */}
          <div className="max-h-[420px] overflow-y-auto space-y-1 rounded-lg border p-1">
            {filteredRepos.map((repo) => {
              const isSelected = selected.has(repo.fullName)
              const pushed = new Date(repo.pushedAt)
              const daysAgo = Math.floor((Date.now() - pushed.getTime()) / (1000 * 60 * 60 * 24))
              const langColor = repo.language ? langColors[repo.language] || "#6b7280" : null

              return (
                <button
                  key={repo.id}
                  onClick={() => toggleRepo(repo.fullName)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                    isSelected
                      ? "bg-primary/5 border border-primary/20"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border flex-shrink-0",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{repo.fullName}</span>
                      {repo.private ? (
                        <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {repo.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {langColor && (
                      <div className="flex items-center gap-1">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: langColor }}
                        />
                        <span className="text-xs text-muted-foreground">{repo.language}</span>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {daysAgo === 0 ? "today" : daysAgo === 1 ? "1d ago" : `${daysAgo}d ago`}
                    </span>
                  </div>
                </button>
              )
            })}

            {filteredRepos.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No repositories match your search
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={selected.size === 0 || saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save Selection
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
