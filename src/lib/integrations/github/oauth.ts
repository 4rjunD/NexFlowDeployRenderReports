const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

const SCOPES = [
  "repo",           // Read repo data (PRs, commits, issues) — GitHub requires this for private repos; NexFlow uses read-only API calls
  "read:org",       // Read org members and teams (read-only)
  "read:user",      // Read user profile
  "user:email",     // Read user email
  "read:project",   // Read org projects
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
