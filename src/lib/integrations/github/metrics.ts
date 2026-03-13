import { fetchRepos, fetchPullRequests, fetchCommits, fetchReviews, fetchIssues, fetchMilestones } from "./client";
import type { GitHubPullRequest, GitHubCommit, GitHubReview, GitHubIssue, GitHubMilestone } from "./client";

export interface GitHubMetrics {
  pullRequests: {
    opened: number;
    merged: number;
    closed: number;
    openedByAuthor: Record<string, number>;
    mergedByAuthor: Record<string, number>;
    avgMergeTimeHours: number;
    avgPrSizeLines: number;
    stalePrs: {
      number: number;
      title: string;
      author: string;
      createdAt: string;
      daysOpen: number;
      additions: number;
      deletions: number;
      reviewCount: number;
      url: string;
    }[];
    prDetails: {
      number: number;
      title: string;
      author: string;
      additions: number;
      deletions: number;
      state: string;
      mergedAt: string | null;
    }[];
  };
  commits: {
    total: number;
    byAuthor: Record<string, number>;
  };
  reviews: {
    total: number;
    byReviewer: Record<string, number>;
    avgTurnaroundTimeHours: number;
    comments: number;
  };
  issues: {
    total: number;
    open: number;
    closed: number;
    byAssignee: Record<string, { total: number; open: number; closed: number }>;
    byLabel: Record<string, { total: number; open: number; closed: number }>;
    recentlyClosed: { number: number; title: string; assignee: string; closedAt: string; repo: string }[];
    overdue: { number: number; title: string; assignee: string; milestone: string; repo: string }[];
  };
  milestones: {
    title: string;
    state: string;
    dueOn: string | null;
    openIssues: number;
    closedIssues: number;
    completionPct: number;
    repo: string;
  }[];
  repos: string[];
  period: { since: string; until: string };
}

// Concurrency limiter to avoid rate limits
async function batchParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

export async function collectGithubMetrics(
  accessToken: string,
  since: string,
  selectedRepoNames?: string[]
): Promise<GitHubMetrics> {
  const now = new Date().toISOString();
  const repos = await fetchRepos(accessToken);

  // If user selected specific repos, filter to those; otherwise top 15
  let activeRepos;
  if (selectedRepoNames && selectedRepoNames.length > 0) {
    const selectedSet = new Set(selectedRepoNames);
    activeRepos = repos.filter((r) => selectedSet.has(r.full_name));
  } else {
    activeRepos = repos.slice(0, 15);
  }

  const allPRs: (GitHubPullRequest & { _owner: string; _repo: string })[] = [];
  const allCommits: GitHubCommit[] = [];
  const allReviews: (GitHubReview & { _prCreatedAt: string })[] = [];
  const allIssues: (GitHubIssue & { _repo: string })[] = [];
  const allMilestones: (GitHubMilestone & { _repo: string })[] = [];

  // Fetch PRs, commits, issues, and milestones in parallel batches of 5 repos at a time
  await batchParallel(
    activeRepos,
    async (repo) => {
      const owner = repo.owner.login;
      const repoName = repo.name;

      const [prs, commits, issues, milestones] = await Promise.all([
        fetchPullRequests(accessToken, owner, repoName, since).catch(() => [] as GitHubPullRequest[]),
        fetchCommits(accessToken, owner, repoName, since).catch(() => [] as GitHubCommit[]),
        fetchIssues(accessToken, owner, repoName, since).catch(() => [] as GitHubIssue[]),
        fetchMilestones(accessToken, owner, repoName).catch(() => [] as GitHubMilestone[]),
      ]);

      prs.forEach((pr) => allPRs.push({ ...pr, _owner: owner, _repo: repoName }));
      allCommits.push(...commits);
      issues.forEach((i) => allIssues.push({ ...i, _repo: repo.full_name }));
      milestones.forEach((m) => allMilestones.push({ ...m, _repo: repo.full_name }));
    },
    5
  );

  // Fetch reviews in parallel batches of 10 — limit to 30 most recent PRs total
  const prsToReview = allPRs
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);

  await batchParallel(
    prsToReview,
    async (pr) => {
      const reviews = await fetchReviews(accessToken, pr._owner, pr._repo, pr.number);
      reviews.forEach((r) =>
        allReviews.push({ ...r, _prCreatedAt: pr.created_at })
      );
    },
    10
  );

  // Compute PR metrics
  const opened = allPRs.length;
  const merged = allPRs.filter((pr) => pr.merged_at !== null).length;
  const closed = allPRs.filter((pr) => pr.state === "closed" && pr.merged_at === null).length;

  const openedByAuthor: Record<string, number> = {};
  const mergedByAuthor: Record<string, number> = {};

  for (const pr of allPRs) {
    const author = pr.user.login;
    openedByAuthor[author] = (openedByAuthor[author] || 0) + 1;
    if (pr.merged_at) {
      mergedByAuthor[author] = (mergedByAuthor[author] || 0) + 1;
    }
  }

  // Average merge time
  const mergedPRs = allPRs.filter((pr) => pr.merged_at);
  const avgMergeTimeHours =
    mergedPRs.length > 0
      ? mergedPRs.reduce((sum, pr) => {
          const created = new Date(pr.created_at).getTime();
          const mergedAt = new Date(pr.merged_at!).getTime();
          return sum + (mergedAt - created) / (1000 * 60 * 60);
        }, 0) / mergedPRs.length
      : 0;

  // Commit metrics
  const commitsByAuthor: Record<string, number> = {};
  for (const commit of allCommits) {
    const author = commit.author?.login || commit.commit.author.name;
    commitsByAuthor[author] = (commitsByAuthor[author] || 0) + 1;
  }

  // Review metrics
  const byReviewer: Record<string, number> = {};
  let totalComments = 0;
  const turnaroundTimes: number[] = [];

  for (const review of allReviews) {
    const reviewer = review.user.login;
    byReviewer[reviewer] = (byReviewer[reviewer] || 0) + 1;

    if (review.body) totalComments++;

    if (review.submitted_at && review._prCreatedAt) {
      const prCreated = new Date(review._prCreatedAt).getTime();
      const reviewedAt = new Date(review.submitted_at).getTime();
      turnaroundTimes.push((reviewedAt - prCreated) / (1000 * 60 * 60));
    }
  }

  const avgTurnaroundTimeHours =
    turnaroundTimes.length > 0
      ? turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length
      : 0;

  // Issue metrics
  const openIssues = allIssues.filter(i => i.state === "open").length;
  const closedIssues = allIssues.filter(i => i.state === "closed").length;
  const issuesByAssignee: Record<string, { total: number; open: number; closed: number }> = {};
  const issuesByLabel: Record<string, { total: number; open: number; closed: number }> = {};
  const recentlyClosedIssues: GitHubMetrics["issues"]["recentlyClosed"] = [];
  const overdueIssues: GitHubMetrics["issues"]["overdue"] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  for (const issue of allIssues) {
    const assignee = issue.assignee?.login || "Unassigned";
    const isClosed = issue.state === "closed";

    if (!issuesByAssignee[assignee]) issuesByAssignee[assignee] = { total: 0, open: 0, closed: 0 };
    issuesByAssignee[assignee].total++;
    if (isClosed) issuesByAssignee[assignee].closed++;
    else issuesByAssignee[assignee].open++;

    for (const label of issue.labels) {
      if (!issuesByLabel[label.name]) issuesByLabel[label.name] = { total: 0, open: 0, closed: 0 };
      issuesByLabel[label.name].total++;
      if (isClosed) issuesByLabel[label.name].closed++;
      else issuesByLabel[label.name].open++;
    }

    if (isClosed && issue.closed_at && new Date(issue.closed_at) >= fourteenDaysAgo) {
      recentlyClosedIssues.push({
        number: issue.number,
        title: issue.title,
        assignee,
        closedAt: issue.closed_at,
        repo: issue._repo,
      });
    }

    // Check for overdue via milestone
    if (!isClosed && issue.milestone?.due_on && new Date(issue.milestone.due_on) < new Date()) {
      overdueIssues.push({
        number: issue.number,
        title: issue.title,
        assignee,
        milestone: issue.milestone.title,
        repo: issue._repo,
      });
    }
  }

  // Deduplicate milestones (same milestone appears per repo)
  const seenMilestones = new Set<string>();
  const milestoneMetrics: GitHubMetrics["milestones"] = [];
  for (const m of allMilestones) {
    const key = `${m._repo}:${m.title}`;
    if (seenMilestones.has(key)) continue;
    seenMilestones.add(key);
    const total = m.open_issues + m.closed_issues;
    milestoneMetrics.push({
      title: m.title,
      state: m.state,
      dueOn: m.due_on,
      openIssues: m.open_issues,
      closedIssues: m.closed_issues,
      completionPct: total > 0 ? Math.round((m.closed_issues / total) * 100) : 0,
      repo: m._repo,
    });
  }

  // Stale PRs — open for more than 5 days
  const nowMs = Date.now();
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const stalePrs = allPRs
    .filter((pr) => pr.state === "open" && nowMs - new Date(pr.created_at).getTime() > fiveDaysMs)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      createdAt: pr.created_at,
      daysOpen: Math.floor((nowMs - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      additions: pr.additions,
      deletions: pr.deletions,
      reviewCount: pr.review_comments,
      url: pr.html_url,
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen);

  // Average PR size in lines (additions + deletions)
  const avgPrSizeLines =
    allPRs.length > 0
      ? Math.round(allPRs.reduce((sum, pr) => sum + pr.additions + pr.deletions, 0) / allPRs.length)
      : 0;

  return {
    pullRequests: {
      opened,
      merged,
      closed,
      openedByAuthor,
      mergedByAuthor,
      avgMergeTimeHours: Math.round(avgMergeTimeHours * 10) / 10,
      avgPrSizeLines,
      stalePrs,
      prDetails: allPRs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        additions: pr.additions,
        deletions: pr.deletions,
        state: pr.state,
        mergedAt: pr.merged_at,
      })),
    },
    commits: {
      total: allCommits.length,
      byAuthor: commitsByAuthor,
    },
    reviews: {
      total: allReviews.length,
      byReviewer,
      avgTurnaroundTimeHours: Math.round(avgTurnaroundTimeHours * 10) / 10,
      comments: totalComments,
    },
    issues: {
      total: allIssues.length,
      open: openIssues,
      closed: closedIssues,
      byAssignee: issuesByAssignee,
      byLabel: issuesByLabel,
      recentlyClosed: recentlyClosedIssues.slice(0, 20),
      overdue: overdueIssues.slice(0, 15),
    },
    milestones: milestoneMetrics,
    repos: activeRepos.map((r) => r.full_name),
    period: { since, until: now },
  };
}
