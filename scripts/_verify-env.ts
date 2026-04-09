/**
 * Environment + connection verification script.
 *
 * Run this at the start of any new Claude Code session (or whenever you
 * need to confirm the platform is fully wired). It reads .env directly,
 * confirms every required key is present, and smoke-tests the DB and
 * SMTP connections.
 *
 * Usage:
 *   cd /Users/arjundixit/PaidReportsMVP
 *   npx tsx scripts/_verify-env.ts
 */
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

// Manually load .env (no dotenv dependency required)
try {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.error("[FAIL] .env file not found at", envPath);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, rawV] = m;
    if (process.env[k]) continue;
    let v = rawV.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
} catch (e) {
  console.error("[FAIL] Could not read .env:", (e as Error).message);
  process.exit(1);
}

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "ANTHROPIC_API_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "LINEAR_CLIENT_ID",
  "LINEAR_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "TOKEN_ENCRYPTION_KEY",
];

function mask(s: string) {
  if (!s) return "";
  if (s.length <= 8) return "***";
  return s.slice(0, 4) + "***" + s.slice(-2);
}

async function main() {
  console.log("\n=== NexFlow Platform Verification ===\n");

  // 1. .env key presence
  console.log("[step 1/4] Checking .env keys...");
  let missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) {
      missing.push(key);
      console.log(`  [FAIL] ${key} — missing`);
    } else {
      console.log(`  [ok]   ${key} = ${mask(process.env[key]!)}`);
    }
  }
  if (missing.length > 0) {
    console.error(`\n[FAIL] ${missing.length} required env key(s) missing. Check .env file.`);
    process.exit(1);
  }
  console.log(`  All ${REQUIRED_KEYS.length} required keys present.\n`);

  // 2. Database connection
  console.log("[step 2/4] Testing Supabase database connection...");
  try {
    // Dynamic import so we don't fail on this file alone if prisma isn't set up
    const prismaModule = await import("../src/lib/db/prisma");
    const prisma = prismaModule.default;
    const orgCount = await prisma.organization.count();
    const integrationCount = await prisma.integration.count();
    const reportCount = await prisma.report.count();
    console.log(`  [ok] DB connected. Organizations: ${orgCount}, Integrations: ${integrationCount}, Reports: ${reportCount}`);
    await prisma.$disconnect();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Tenant or user not found")) {
      console.error("  [FAIL] Supabase project is PAUSED.");
      console.error("  Restore at: https://supabase.com/dashboard/project/weefryjnyrjfasvofgur");
      process.exit(1);
    }
    console.error("  [FAIL] DB connection error:", msg.split("\n")[0]);
    process.exit(1);
  }

  // 3. SMTP authentication
  console.log("\n[step 3/4] Testing SMTP authentication...");
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
    await transporter.verify();
    console.log(`  [ok] SMTP authenticated as ${process.env.SMTP_USER}`);
  } catch (e) {
    console.error("  [FAIL] SMTP auth error:", (e as Error).message.split("\n")[0]);
    process.exit(1);
  }

  // 4. Token encryption round-trip
  console.log("\n[step 4/4] Testing token encryption/decryption...");
  try {
    const cryptoModule = await import("../src/lib/crypto");
    const testPlain = "gho_test_token_value_for_roundtrip_check";
    const encrypted = cryptoModule.encryptToken(testPlain);
    const decrypted = cryptoModule.decryptToken(encrypted);
    if (decrypted !== testPlain) {
      console.error("  [FAIL] Token encryption round-trip mismatch");
      process.exit(1);
    }
    console.log("  [ok] AES-256-GCM encrypt/decrypt working");
  } catch (e) {
    console.error("  [FAIL] Encryption test error:", (e as Error).message.split("\n")[0]);
    process.exit(1);
  }

  console.log("\n=== All checks passed. Platform is fully wired. ===\n");
  console.log("You can now:");
  console.log("  - Query clients via Prisma (see src/lib/db/prisma.ts)");
  console.log("  - Decrypt OAuth tokens via decryptToken() from src/lib/crypto.ts");
  console.log("  - Send client emails via nodemailer (see scripts/_send-handbook-email.ts)");
  console.log("  - Call client dev tools via src/lib/integrations/*");
  console.log("");
}

main().catch((e) => {
  console.error("[FAIL]", e);
  process.exit(1);
});
