import { fetchRepos, fetchPullRequests, fetchCommits, fetchReviews } from "./client";
import type { GitHubPullRequest, GitHubCommit, GitHubReview } from "./client";

export interface GitHubMetrics {
  pullRequests: {
    opened: number;
    merged: number;
    closed: number;
    openedByAuthor: Record<string, number>;
    mergedByAuthor: Record<string, number>;
    avgMergeTimeHours: number;
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

  // Fetch PRs and commits in parallel batches of 5 repos at a time
  await batchParallel(
    activeRepos,
    async (repo) => {
      const owner = repo.owner.login;
      const repoName = repo.name;

      const [prs, commits] = await Promise.all([
        fetchPullRequests(accessToken, owner, repoName, since).catch(() => [] as GitHubPullRequest[]),
        fetchCommits(accessToken, owner, repoName, since).catch(() => [] as GitHubCommit[]),
      ]);

      prs.forEach((pr) => allPRs.push({ ...pr, _owner: owner, _repo: repoName }));
      allCommits.push(...commits);
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

  return {
    pullRequests: {
      opened,
      merged,
      closed,
      openedByAuthor,
      mergedByAuthor,
      avgMergeTimeHours: Math.round(avgMergeTimeHours * 10) / 10,
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
    repos: activeRepos.map((r) => r.full_name),
    period: { since, until: now },
  };
}
