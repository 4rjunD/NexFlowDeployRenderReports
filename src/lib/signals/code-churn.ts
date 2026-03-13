// ─────────────────────────────────────────────────────────────
// NexFlow Intelligence Engine — Code Churn Analysis
// ─────────────────────────────────────────────────────────────

import type { GitHubMetrics } from "@/lib/integrations/github/metrics";

export interface CodeChurnAnalysis {
  netLinesAdded: number;              // total additions - total deletions
  totalAdditions: number;
  totalDeletions: number;
  churnRatio: number;                 // deletions / additions (high = refactoring)
  avgPrSize: number;                  // average additions + deletions per PR
  largePrCount: number;               // PRs with >500 total lines
  largePrs: {
    number: number;
    title: string;
    author: string;
    totalLines: number;
    additions: number;
    deletions: number;
  }[];
  churnByAuthor: Record<string, { additions: number; deletions: number; net: number }>;
  codeGrowthPct: number;             // rough estimate: netLinesAdded / totalAdditions * 100
}

const LARGE_PR_THRESHOLD = 500;
const MAX_LARGE_PRS = 10;

/**
 * Analyze code churn from GitHub integration data.
 *
 * When per-PR detail (`prDetails`) is available, uses it for precise
 * per-author and large-PR analysis. Otherwise falls back to the
 * aggregated `avgPrSizeLines`, `stalePrs`, and `commits.byAuthor`
 * fields that are always present in `GitHubMetrics`.
 */
export function analyzeCodeChurn(githubData: GitHubMetrics): CodeChurnAnalysis {
  const prs = githubData.pullRequests;
  const prDetails = prs.prDetails;

  // ── Per-PR detail path (preferred) ──────────────────────
  if (prDetails && prDetails.length > 0) {
    return analyzeFromPrDetails(prDetails, githubData);
  }

  // ── Fallback: estimate from aggregated stats ────────────
  return estimateFromAggregates(githubData);
}

// ── Detailed analysis using per-PR data ──────────────────

function analyzeFromPrDetails(
  prDetails: GitHubMetrics["pullRequests"]["prDetails"],
  githubData: GitHubMetrics
): CodeChurnAnalysis {
  let totalAdditions = 0;
  let totalDeletions = 0;
  const churnByAuthor: Record<string, { additions: number; deletions: number; net: number }> = {};
  const largePrs: CodeChurnAnalysis["largePrs"] = [];

  for (const pr of prDetails) {
    totalAdditions += pr.additions;
    totalDeletions += pr.deletions;

    // Per-author accumulation
    if (!churnByAuthor[pr.author]) {
      churnByAuthor[pr.author] = { additions: 0, deletions: 0, net: 0 };
    }
    churnByAuthor[pr.author].additions += pr.additions;
    churnByAuthor[pr.author].deletions += pr.deletions;
    churnByAuthor[pr.author].net += pr.additions - pr.deletions;

    // Large PR detection
    const totalLines = pr.additions + pr.deletions;
    if (totalLines > LARGE_PR_THRESHOLD) {
      largePrs.push({
        number: pr.number,
        title: pr.title,
        author: pr.author,
        totalLines,
        additions: pr.additions,
        deletions: pr.deletions,
      });
    }
  }

  // Sort large PRs by total lines descending, take top N
  largePrs.sort((a, b) => b.totalLines - a.totalLines);
  const topLargePrs = largePrs.slice(0, MAX_LARGE_PRS);

  const netLinesAdded = totalAdditions - totalDeletions;
  const prCount = prDetails.length;

  return {
    netLinesAdded,
    totalAdditions,
    totalDeletions,
    churnRatio: totalAdditions > 0
      ? Math.round((totalDeletions / totalAdditions) * 100) / 100
      : 0,
    avgPrSize: prCount > 0
      ? Math.round((totalAdditions + totalDeletions) / prCount)
      : githubData.pullRequests.avgPrSizeLines,
    largePrCount: largePrs.length,
    largePrs: topLargePrs,
    churnByAuthor,
    codeGrowthPct: totalAdditions > 0
      ? Math.round((netLinesAdded / totalAdditions) * 10000) / 100
      : 0,
  };
}

// ── Fallback analysis from aggregated metrics ────────────

function estimateFromAggregates(githubData: GitHubMetrics): CodeChurnAnalysis {
  const prs = githubData.pullRequests;
  const totalPrCount = prs.opened;
  const avgSize = prs.avgPrSizeLines;

  // Best-effort: compute from stalePrs if they have line data
  let totalAdditions = 0;
  let totalDeletions = 0;
  const churnByAuthor: Record<string, { additions: number; deletions: number; net: number }> = {};
  const largePrs: CodeChurnAnalysis["largePrs"] = [];

  if (prs.stalePrs && prs.stalePrs.length > 0) {
    for (const pr of prs.stalePrs) {
      totalAdditions += pr.additions;
      totalDeletions += pr.deletions;

      if (!churnByAuthor[pr.author]) {
        churnByAuthor[pr.author] = { additions: 0, deletions: 0, net: 0 };
      }
      churnByAuthor[pr.author].additions += pr.additions;
      churnByAuthor[pr.author].deletions += pr.deletions;
      churnByAuthor[pr.author].net += pr.additions - pr.deletions;

      const totalLines = pr.additions + pr.deletions;
      if (totalLines > LARGE_PR_THRESHOLD) {
        largePrs.push({
          number: pr.number,
          title: pr.title,
          author: pr.author,
          totalLines,
          additions: pr.additions,
          deletions: pr.deletions,
        });
      }
    }
  }

  // If stalePrs gave us nothing, estimate from avgPrSizeLines
  if (totalAdditions === 0 && totalDeletions === 0 && totalPrCount > 0 && avgSize > 0) {
    // Rough split: assume 65% additions, 35% deletions (typical ratio)
    const estimatedTotalLines = avgSize * totalPrCount;
    totalAdditions = Math.round(estimatedTotalLines * 0.65);
    totalDeletions = Math.round(estimatedTotalLines * 0.35);

    // Distribute proportionally using commits.byAuthor as proxy
    const commitsByAuthor = githubData.commits.byAuthor;
    const totalCommits = githubData.commits.total || 1;
    for (const [author, count] of Object.entries(commitsByAuthor)) {
      const share = count / totalCommits;
      const authorAdd = Math.round(totalAdditions * share);
      const authorDel = Math.round(totalDeletions * share);
      churnByAuthor[author] = {
        additions: authorAdd,
        deletions: authorDel,
        net: authorAdd - authorDel,
      };
    }
  }

  largePrs.sort((a, b) => b.totalLines - a.totalLines);

  const netLinesAdded = totalAdditions - totalDeletions;

  return {
    netLinesAdded,
    totalAdditions,
    totalDeletions,
    churnRatio: totalAdditions > 0
      ? Math.round((totalDeletions / totalAdditions) * 100) / 100
      : 0,
    avgPrSize: avgSize,
    largePrCount: largePrs.length,
    largePrs: largePrs.slice(0, MAX_LARGE_PRS),
    churnByAuthor,
    codeGrowthPct: totalAdditions > 0
      ? Math.round((netLinesAdded / totalAdditions) * 10000) / 100
      : 0,
  };
}
