import { NextResponse } from "next/server";
import { resolveOrgId } from "@/lib/integrations/resolve-org";
import { getLinearAuthUrl } from "@/lib/integrations/linear/oauth";

export async function GET(request: Request) {
  const result = await resolveOrgId(request);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const authUrl = getLinearAuthUrl(result.orgId);
  return NextResponse.redirect(authUrl);
}
