// ─────────────────────────────────────────────────────────────
// Jira OAuth 2.0 (3LO) helpers
// ─────────────────────────────────────────────────────────────

const JIRA_AUTH_URL = "https://auth.atlassian.com/authorize";
const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

const SCOPES = [
  "read:jira-work",                        // Read issues, sprints, boards
  "read:jira-user",                        // Read user profiles
  "read:servicedesk-request",              // Read service desk tickets
  "read:servicemanagement-insight-objects", // Read insight objects
  "read:me",                               // Read authenticated user
  "read:account",                          // Read account info
  "offline_access",                        // Refresh token support
];

const CALLBACK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/callback/jira`;

export function getJiraAuthUrl(orgId: string): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: process.env.JIRA_CLIENT_ID!,
    scope: SCOPES.join(" "),
    redirect_uri: CALLBACK_URL,
    state: orgId,
    response_type: "code",
    prompt: "consent",
  });

  return `${JIRA_AUTH_URL}?${params.toString()}`;
}

export interface JiraTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export async function exchangeJiraCode(code: string): Promise<JiraTokenResponse> {
  const response = await fetch(JIRA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.JIRA_CLIENT_ID!,
      client_secret: process.env.JIRA_CLIENT_SECRET!,
      code,
      redirect_uri: CALLBACK_URL,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira token exchange failed: ${response.status} ${text}`);
  }

  const data: JiraTokenResponse = await response.json();
  return data;
}
