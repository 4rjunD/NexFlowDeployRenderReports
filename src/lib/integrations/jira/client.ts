// ─────────────────────────────────────────────────────────────
// Jira REST API client
// ─────────────────────────────────────────────────────────────

const JIRA_API = "https://api.atlassian.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export interface JiraCloudSite {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string; name: string } };
    priority?: { name: string };
    issuetype: { name: string };
    assignee?: { displayName: string; accountId: string } | null;
    reporter?: { displayName: string; accountId: string } | null;
    created: string;
    updated: string;
    resolutiondate?: string | null;
    labels?: string[];
    story_points?: number;
    // custom fields may vary
    [key: string]: unknown;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string; // active, closed, future
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

// Get accessible Jira cloud sites for this token
export async function getAccessibleSites(token: string): Promise<JiraCloudSite[]> {
  const res = await fetch(`${JIRA_API}/oauth/token/accessible-resources`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Jira accessible-resources failed: ${res.status}`);
  return res.json();
}

async function jiraFetch<T>(token: string, cloudId: string, path: string): Promise<T> {
  const url = `${JIRA_API}/ex/jira/${cloudId}/rest/api/3${path}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    throw new Error(`Jira API error ${res.status} on ${path}`);
  }
  return res.json();
}

async function jiraAgile<T>(token: string, cloudId: string, path: string): Promise<T> {
  const url = `${JIRA_API}/ex/jira/${cloudId}/rest/agile/1.0${path}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) {
    throw new Error(`Jira Agile API error ${res.status} on ${path}`);
  }
  return res.json();
}

export async function fetchProjects(token: string, cloudId: string): Promise<JiraProject[]> {
  const data = await jiraFetch<{ values: JiraProject[] }>(token, cloudId, "/project/search?maxResults=50");
  return data.values || [];
}

export async function fetchBoards(token: string, cloudId: string): Promise<JiraBoard[]> {
  const data = await jiraAgile<{ values: JiraBoard[] }>(token, cloudId, "/board?maxResults=50");
  return data.values || [];
}

export async function fetchSprintsForBoard(token: string, cloudId: string, boardId: number): Promise<JiraSprint[]> {
  try {
    const data = await jiraAgile<{ values: JiraSprint[] }>(token, cloudId, `/board/${boardId}/sprint?state=active,closed&maxResults=10`);
    return data.values || [];
  } catch {
    return [];
  }
}

export async function searchIssues(token: string, cloudId: string, jql: string, maxResults = 100): Promise<JiraIssue[]> {
  const params = new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields: "summary,status,priority,issuetype,assignee,reporter,created,updated,resolutiondate,labels",
  });
  const data = await jiraFetch<{ issues: JiraIssue[] }>(token, cloudId, `/search?${params.toString()}`);
  return data.issues || [];
}

export async function fetchSprintIssues(token: string, cloudId: string, sprintId: number): Promise<JiraIssue[]> {
  try {
    const data = await jiraAgile<{ issues: JiraIssue[] }>(token, cloudId, `/sprint/${sprintId}/issue?maxResults=100&fields=summary,status,priority,issuetype,assignee,reporter,created,updated,resolutiondate,labels`);
    return data.issues || [];
  } catch {
    return [];
  }
}
