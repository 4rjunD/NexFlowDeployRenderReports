const LINEAR_AUTH_URL = "https://linear.app/oauth/authorize";
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";

const SCOPES = ["read"];

const CALLBACK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/callback/linear`;

export function getLinearAuthUrl(orgId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.LINEAR_CLIENT_ID!,
    redirect_uri: CALLBACK_URL,
    scope: SCOPES.join(","),
    state: orgId,
    response_type: "code",
    prompt: "consent",
  });

  return `${LINEAR_AUTH_URL}?${params.toString()}`;
}

export async function exchangeLinearCode(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string[];
}> {
  const response = await fetch(LINEAR_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.LINEAR_CLIENT_ID!,
      client_secret: process.env.LINEAR_CLIENT_SECRET!,
      redirect_uri: CALLBACK_URL,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear token exchange failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Linear OAuth error: ${data.error_description || data.error}`);
  }

  return data;
}
