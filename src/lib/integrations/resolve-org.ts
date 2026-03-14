import { NextRequest } from "next/server";
import prisma from "@/lib/db/prisma";
import { auth } from "@/lib/auth";

// Resolves orgId from either an onboarding token or an authenticated admin session.
// Used by the integration connect routes.
export async function resolveOrgId(
  request: NextRequest
): Promise<{ orgId: string } | { error: string; status: number }> {
  const onboardingToken = request.nextUrl.searchParams.get("onboarding");

  if (onboardingToken) {
    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token: onboardingToken },
    });

    if (!onboarding) {
      return { error: "Invalid onboarding token", status: 400 };
    }

    if (onboarding.expiresAt < new Date()) {
      return { error: "Onboarding link has expired", status: 400 };
    }

    return { orgId: onboarding.orgId };
  }

  // Fallback: authenticated admin user
  const session = await auth();
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 };
  }

  const orgId = (session.user as any).orgId as string | undefined;
  if (!orgId) {
    return { error: "No organization found", status: 400 };
  }

  return { orgId };
}
