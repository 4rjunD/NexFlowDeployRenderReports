const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

const SCOPES = [
  "repo",                  // Full control of private repositories
  "workflow",              // Update GitHub Action workflows
  "write:packages",        // Upload packages to GitHub Package Registry
  "delete:packages",       // Delete packages from GitHub Package Registry
  "admin:org",             // Full control of orgs and teams, read and write org projects
  "admin:public_key",      // Full control of user public keys
  "admin:repo_hook",       // Full control of repository hooks
  "admin:org_hook",        // Full control of organization hooks
  "gist",                  // Create gists
  "notifications",         // Access notifications
  "user",                  // Update all user data
  "delete_repo",           // Delete repositories
  "write:discussion",      // Read and write team discussions
  "admin:enterprise",      // Full control of enterprises
  "admin:gpg_key",         // Full control of public user GPG keys
  "admin:ssh_signing_key", // Full control of public user SSH signing keys
  "codespace",             // Full control of codespaces
  "project",               // Full control of projects
  "audit_log",             // Full control of audit log
  "copilot",               // Full control of Copilot settings
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
