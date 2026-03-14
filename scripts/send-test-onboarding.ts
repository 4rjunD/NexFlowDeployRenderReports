import prisma from "../src/lib/db/prisma";
import { sendOnboardingEmail } from "../src/lib/email/send";
import crypto from "crypto";

async function main() {
  const email = process.argv[2];
  const clientName = process.argv[3] || "Arjun";
  const companyName = process.argv[4] || "TestCo";

  if (!email) {
    console.error("Usage: npx tsx scripts/send-test-onboarding.ts <email> [clientName] [companyName]");
    process.exit(1);
  }

  // Create or reuse a test org
  const slug = `testco-${crypto.randomBytes(3).toString("hex")}`;
  const org = await prisma.organization.create({
    data: { name: companyName, slug, plan: "starter" },
  });

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.clientOnboarding.create({
    data: {
      orgId: org.id,
      token,
      email,
      clientName,
      status: "PENDING",
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const setupUrl = `${baseUrl}/setup/${token}`;

  console.log("Org created:", org.id);
  console.log("Setup URL:", setupUrl);
  console.log("Sending onboarding email to:", email);

  const result = await sendOnboardingEmail({
    to: email,
    clientName,
    companyName,
    setupUrl,
  });

  console.log("Email sent! SMTP response:", result.response);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
