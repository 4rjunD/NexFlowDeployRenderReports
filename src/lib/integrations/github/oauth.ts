const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

const SCOPES = [
  "repo",             // Full control of private repos (read code, open PRs, push commits)
  "workflow",         // Create and update GitHub Actions workflows (QA/CI automation)
  "admin:repo_hook",  // Create and manage repository webhooks
  "write:discussion", // Comment on team and PR discussions
  "project",          // Read and write GitHub Projects (for QA tracking)
  "read:org",         // Read org structure, teams, and members
  "user:email",       // Read the authenticated user's email
  "notifications",    // Read notifications (for review queue awareness)
  "codespace",        // Manage Codespaces if needed for reproducing bugs
];

const CALLBACK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/callback/github`;

export function getGithubAuthUrl(orgId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: CALLBACK_URL,
    scope: SCOPES.join(" "),
    state: orgId,
    allow_signup: "false",
  });

  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGithubCode(code: string): Promise<{
  access_token: string;
  token_type: string;
  scope: string;
}> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: CALLBACK_URL,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return data;
}
