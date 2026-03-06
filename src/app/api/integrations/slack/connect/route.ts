import { NextResponse } from "next/server";
import { resolveOrgId } from "@/lib/integrations/resolve-org";
import { getSlackAuthUrl } from "@/lib/integrations/slack/oauth";

export async function GET(request: Request) {
  const result = await resolveOrgId(request);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const authUrl = getSlackAuthUrl(result.orgId);
  return NextResponse.redirect(authUrl);
}
