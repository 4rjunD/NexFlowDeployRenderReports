// ─────────────────────────────────────────────────────────────
// Jira OAuth 2.0 (3LO) helpers
// ─────────────────────────────────────────────────────────────

const JIRA_AUTH_URL = "https://auth.atlassian.com/authorize";
const JIRA_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

const SCOPES = [
  "read:jira-work",
  "read:jira-user",
  "manage:jira-project",
  "manage:jira-configuration",
  "write:jira-work",
  "manage:jira-webhook",
  "read:servicedesk-request",
  "read:servicemanagement-insight-objects",
  "read:me",
  "read:account",
  "offline_access",
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
