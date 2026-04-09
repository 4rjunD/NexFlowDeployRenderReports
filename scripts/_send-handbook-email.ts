/**
 * Send the V2 Contributor Handbook to Arjun as a test email.
 * - Reads /tmp/nick-v2-architecture-briefing.html
 * - Converts to PDF via Puppeteer (local)
 * - Sends plain-text email with PDF attached
 */
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import puppeteer from "puppeteer";

// Manually load .env since dotenv isn't available in this workspace
try {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      let value = rawValue.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
} catch (e) {
  console.warn("[warn] Could not load .env:", (e as Error).message);
}

const TO = process.argv[2] || "arjundixit3508@gmail.com";
const RECIPIENT_NAME = process.argv[3] || "Nick";
const BCC = process.argv[4] || "";
const HTML_PATH = "/tmp/nick-v2-architecture-briefing.html";

async function htmlFileToPdf(filePath: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    // Load via file:// URL so all inline styles and Google Fonts load normally.
    const fileUrl = "file://" + path.resolve(filePath);
    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 });

    // Hide the fixed download bar that appears only on screen
    await page.addStyleTag({
      content: `.download-bar { display: none !important; }
                .download-bar + .page { margin-top: 0 !important; }
                body { background: white !important; }`,
    });

    // Give fonts a moment to settle
    await new Promise((r) => setTimeout(r, 800));

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" },
      preferCSSPageSize: false,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!fs.existsSync(HTML_PATH)) {
    throw new Error(`HTML file not found at ${HTML_PATH}`);
  }

  console.log(`[info] Converting ${HTML_PATH} to PDF...`);
  const pdfBuffer = await htmlFileToPdf(HTML_PATH);
  console.log(`[ok] PDF generated (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const firstName = RECIPIENT_NAME.split(" ")[0];

  const plainTextBody = `Hey ${firstName},

Really good catching up earlier. As promised, attached is the V2 Contributor Handbook -- the tactical companion to the Onboarding Framework from March.

It covers the whole system end-to-end: product orientation, access checklist, codebase map, the 5 golden rules, a first-PR walkthrough, known pitfalls in the current codebase, the ownership map, how we work, and a pre-push checklist. It's written to work for contributors at any technical level -- covers the high-level architecture for the less-technical ones, and goes deep enough on the actual code structure and pitfalls to be useful for the engineers.

Hand it out to anyone who joins, edit it, make it yours -- whatever works. Part 9 (the pre-push checklist) is designed to drop straight into a CONTRIBUTING.md at the root of resourceful-v2.

Let me know if anything's unclear. I'll send over a quick agreement separately that outlines everything we'll do in terms of implementation for the foundation of your platform.

Talk soon,
Arjun

--
NexFlow`;

  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: TO,
    bcc: BCC || undefined,
    subject: `${firstName}, the V2 Contributor Handbook for Resourceful`,
    text: plainTextBody,
    attachments: [
      {
        filename: "Resourceful-V2-Contributor-Handbook.pdf",
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  console.log("[ok] Sent to:", TO);
  console.log("[ok] MessageId:", result.messageId);
  console.log("[ok] Response:", result.response);
}

main().catch((e) => {
  console.error("[err]", e);
  process.exit(1);
});
