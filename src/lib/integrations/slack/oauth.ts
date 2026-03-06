// ─────────────────────────────────────────────────────────────
// Slack OAuth helpers
// ─────────────────────────────────────────────────────────────

const SLACK_SCOPES = [
  "channels:read",
  "channels:history",
  "users:read",
  "users:read.email",
  "team:read",
].join(",")

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access"

/**
 * Generate the Slack OAuth authorize URL.
 * The orgId is encoded in the `state` parameter so the callback can
 * associate the resulting token with the correct organization.
 */
export function getSlackAuthUrl(orgId: string): string {
  const clientId = process.env.SLACK_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/callback/slack`

  if (!clientId) {
    throw new Error("SLACK_CLIENT_ID is not configured")
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri,
    state: orgId,
  })

  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`
}

export interface SlackOAuthResponse {
  ok: boolean
  access_token: string
  token_type: string
  scope: string
  bot_user_id: string
  app_id: string
  team: { id: string; name: string }
  authed_user: { id: string }
  error?: string
}

/**
 * Exchange a Slack authorization code for an access token.
 */
export async function exchangeSlackCode(
  code: string
): Promise<SlackOAuthResponse> {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/callback/slack`

  if (!clientId || !clientSecret) {
    throw new Error("SLACK_CLIENT_ID or SLACK_CLIENT_SECRET is not configured")
  }

  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`Slack token exchange failed: ${response.statusText}`)
  }

  const data: SlackOAuthResponse = await response.json()

  if (!data.ok) {
    throw new Error(`Slack OAuth error: ${data.error ?? "unknown error"}`)
  }

  return data
}
