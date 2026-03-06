import { auth } from "@/lib/auth";
import prisma from "@/lib/db/prisma";

/**
 * Resolve orgId from either:
 * 1. An onboarding token (for client setup flow)
 * 2. The authenticated user's session (for admin flow)
 */
export async function resolveOrgId(
  request: Request
): Promise<{ orgId: string } | { error: string; status: number }> {
  const url = new URL(request.url);
  const onboardingToken = url.searchParams.get("onboarding");

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

  const session = await auth();
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 };
  }

  const orgId = (session.user as any).orgId;
  if (!orgId) {
    return { error: "No organization found", status: 400 };
  }

  return { orgId };
}
