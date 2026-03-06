const LINEAR_API = "https://api.linear.app/graphql";

async function linearQuery<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }

  return json.data;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string; type: string };
  assignee: { name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  estimate: number | null;
  priority: number;
  labels: { nodes: { name: string }[] };
}

export interface LinearCycle {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  completedAt: string | null;
  progress: number;
  scope: number;
  issueCountHistory: number[];
  completedIssueCountHistory: number[];
  issues: { nodes: { id: string; identifier: string; state: { name: string; type: string } }[] };
}

export interface LinearTeamMember {
  id: string;
  name: string;
  email: string;
  displayName: string;
  active: boolean;
}

export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  state: string;
  progress: number;
  startDate: string | null;
  targetDate: string | null;
  lead: { name: string } | null;
  members: { nodes: { name: string }[] };
}

export async function fetchIssues(token: string, since?: string): Promise<LinearIssue[]> {
  const filterArg = since
    ? `, filter: { updatedAt: { gte: "${since}" } }`
    : "";

  const data = await linearQuery<{ issues: { nodes: LinearIssue[] } }>(
    token,
    `query {
      issues(first: 250${filterArg}, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          state { name type }
          assignee { name email }
          createdAt
          updatedAt
          completedAt
          canceledAt
          estimate
          priority
          labels { nodes { name } }
        }
      }
    }`
  );

  return data.issues.nodes;
}

export async function fetchCycles(token: string): Promise<LinearCycle[]> {
  const data = await linearQuery<{ cycles: { nodes: LinearCycle[] } }>(
    token,
    `query {
      cycles(first: 10, orderBy: createdAt) {
        nodes {
          id
          name
          number
          startsAt
          endsAt
          completedAt
          progress
          scope
          issueCountHistory
          completedIssueCountHistory
          issues {
            nodes {
              id
              identifier
              state { name type }
            }
          }
        }
      }
    }`
  );

  return data.cycles.nodes;
}

export async function fetchTeamMembers(token: string): Promise<LinearTeamMember[]> {
  const data = await linearQuery<{ users: { nodes: LinearTeamMember[] } }>(
    token,
    `query {
      users(first: 100) {
        nodes {
          id
          name
          email
          displayName
          active
        }
      }
    }`
  );

  return data.users.nodes;
}

export async function fetchProjects(token: string): Promise<LinearProject[]> {
  const data = await linearQuery<{ projects: { nodes: LinearProject[] } }>(
    token,
    `query {
      projects(first: 50, orderBy: updatedAt) {
        nodes {
          id
          name
          description
          state
          progress
          startDate
          targetDate
          lead { name }
          members { nodes { name } }
        }
      }
    }`
  );

  return data.projects.nodes;
}
