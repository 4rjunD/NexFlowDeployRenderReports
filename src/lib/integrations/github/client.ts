const GITHUB_API = "https://api.github.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  html_url: string;
  description: string | null;
  updated_at: string;
  pushed_at: string;
  language: string | null;
  default_branch: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  user: { login: string; id: number };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  html_url: string;
  review_comments: number;
  comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
  };
  author: { login: string; id: number } | null;
  html_url: string;
}

export interface GitHubReview {
  id: number;
  user: { login: string; id: number };
  state: string;
  body: string;
  submitted_at: string;
  html_url: string;
}

async function githubFetch<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GITHUB_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), { headers: headers(token) });

  // Handle rate limiting
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const resetAt = response.headers.get("x-ratelimit-reset");
      const waitSec = resetAt ? Math.max(0, parseInt(resetAt) - Math.floor(Date.now() / 1000)) : 60;
      console.warn(`[GitHub] Rate limited. Resets in ${waitSec}s. Skipping remaining requests.`);
      throw new Error(`GitHub rate limit exceeded. Resets in ${waitSec}s.`);
    }
  }

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${response.statusText} on ${path}`);
  }

  return response.json();
}

// Max pages to prevent runaway pagination (e.g. 100 items/page × 10 pages = 1000 items max)
const MAX_PAGES = 10;

async function githubFetchPaginated<T>(token: string, path: string, params?: Record<string, string>): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= MAX_PAGES) {
    const url = new URL(`${GITHUB_API}${path}`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), { headers: headers(token) });

    // Handle rate limiting
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        console.warn(`[GitHub] Rate limited during pagination on ${path}. Returning ${results.length} items collected so far.`);
        break;
      }
    }

    if (!response.ok) {
      if (results.length > 0) {
        // Return what we have rather than throwing
        console.warn(`[GitHub] Error on page ${page} of ${path}, returning ${results.length} items collected so far.`);
        break;
      }
      throw new Error(`GitHub API error ${response.status}: ${response.statusText} on ${path}`);
    }

    const data: T[] = await response.json();
    results.push(...data);

    if (data.length < perPage) break;
    page++;
  }

  return results;
}

export async function fetchRepos(token: string): Promise<GitHubRepo[]> {
  const seen = new Set<number>();
  const allRepos: GitHubRepo[] = [];

  function addRepos(repos: GitHubRepo[]) {
    for (const repo of repos) {
      if (!seen.has(repo.id)) {
        seen.add(repo.id);
        allRepos.push(repo);
      }
    }
  }

  // 1. All repos the user has any access to (owned, collab, org member)
  try {
    const userRepos = await githubFetchPaginated<GitHubRepo>(token, "/user/repos", {
      sort: "pushed",
      direction: "desc",
      affiliation: "owner,collaborator,organization_member",
    });
    addRepos(userRepos);
  } catch (e) {
    console.warn("[GitHub] Failed to fetch user repos:", e);
  }

  // 2. All repos from every org the user belongs to
  try {
    const orgs = await githubFetchPaginated<{ login: string }>(token, "/user/orgs");
    for (const org of orgs) {
      try {
        // All org repos (public, private, forks, everything)
        const orgRepos = await githubFetchPaginated<GitHubRepo>(token, `/orgs/${org.login}/repos`, {
          sort: "pushed",
          direction: "desc",
          type: "all",
        });
        addRepos(orgRepos);
      } catch (e) {
        console.warn(`[GitHub] Failed to fetch repos for org ${org.login}:`, e);
      }
    }
  } catch (e) {
    console.warn("[GitHub] Failed to fetch user orgs:", e);
  }

  // Sort by most recently pushed
  allRepos.sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());

  return allRepos;
}

export async function fetchPullRequests(
  token: string,
  owner: string,
  repo: string,
  since?: string
): Promise<GitHubPullRequest[]> {
  const params: Record<string, string> = {
    state: "all",
    sort: "updated",
    direction: "desc",
  };
  if (since) params.since = since;

  const prs = await githubFetchPaginated<GitHubPullRequest>(token, `/repos/${owner}/${repo}/pulls`, params);

  // Filter by since date if provided
  if (since) {
    const sinceDate = new Date(since);
    return prs.filter((pr) => new Date(pr.updated_at) >= sinceDate);
  }

  return prs;
}

export async function fetchCommits(
  token: string,
  owner: string,
  repo: string,
  since?: string
): Promise<GitHubCommit[]> {
  const params: Record<string, string> = {};
  if (since) params.since = since;

  return githubFetchPaginated<GitHubCommit>(token, `/repos/${owner}/${repo}/commits`, params);
}

export async function fetchReviews(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubReview[]> {
  return githubFetch<GitHubReview[]>(token, `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);
}

// GitHub Issues (not PRs) — for deliverable/milestone tracking
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  state_reason?: string | null;
  user: { login: string; id: number };
  assignee?: { login: string; id: number } | null;
  assignees?: { login: string; id: number }[];
  labels: { name: string; color: string }[];
  milestone?: { title: string; state: string; due_on: string | null; open_issues: number; closed_issues: number } | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  body: string | null;
  html_url: string;
  pull_request?: unknown; // present if this is a PR
}

export interface GitHubMilestone {
  id: number;
  title: string;
  state: string;
  description: string | null;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export async function fetchIssues(
  token: string,
  owner: string,
  repo: string,
  since?: string
): Promise<GitHubIssue[]> {
  const params: Record<string, string> = {
    state: "all",
    sort: "updated",
    direction: "desc",
  };
  if (since) params.since = since;

  const all = await githubFetchPaginated<GitHubIssue>(token, `/repos/${owner}/${repo}/issues`, params);
  // Filter out PRs (GitHub returns PRs in issues endpoint)
  return all.filter(i => !i.pull_request);
}

export async function fetchMilestones(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubMilestone[]> {
  return githubFetchPaginated<GitHubMilestone>(token, `/repos/${owner}/${repo}/milestones`, {
    state: "all",
    sort: "due_on",
    direction: "desc",
  });
}
