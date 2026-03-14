import { NextRequest, NextResponse } from "next/server";
import { resolveOrgId } from "@/lib/integrations/resolve-org";
import { getJiraAuthUrl } from "@/lib/integrations/jira/oauth";

export async function GET(request: NextRequest) {
  const result = await resolveOrgId(request);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const authUrl = getJiraAuthUrl(result.orgId);
  return NextResponse.redirect(authUrl);
}
