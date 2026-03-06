// ─────────────────────────────────────────────────────────────
// NexFlow Platform — Prisma Seed Script (Admin Only)
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting NexFlow seed (admin only)...\n");

  // Clear all tables
  console.log("  Clearing existing data...");
  await prisma.$transaction([
    prisma.reportDelivery.deleteMany(),
    prisma.deliveryPreference.deleteMany(),
    prisma.report.deleteMany(),
    prisma.signal.deleteMany(),
    prisma.event.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.clientOnboarding.deleteMany(),
    prisma.team.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
  console.log("  All tables cleared\n");

  // Create admin organization
  const org = await prisma.organization.create({
    data: {
      name: "NexFlow",
      slug: "nexflow",
      domain: "nexflowinc.com",
      plan: "enterprise",
    },
  });
  console.log(`  Organization: ${org.name} (${org.id})`);

  // Create admin user
  const user = await prisma.user.create({
    data: {
      name: "Rishi Yedavalli",
      email: "sarah@nexflow.dev",
      password: "admin123",
      role: "ADMIN",
      orgId: org.id,
      emailVerified: new Date(),
    },
  });
  console.log(`  Admin user: ${user.name} (${user.email})`);

  console.log("\nSeed complete. Database is clean — ready for real clients.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
