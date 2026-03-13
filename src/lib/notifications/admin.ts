// ─────────────────────────────────────────────────────────────
// NexFlow — Admin Notification System
// Notifies admins when a report is ready for review.
// ─────────────────────────────────────────────────────────────

import nodemailer from "nodemailer";
import prisma from "@/lib/db/prisma";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface AdminNotifyOptions {
  reportId: string;
  orgId: string;
  reportTitle: string;
  healthScore: { overall: number; grade: string } | null;
  topDiscoveries: string[];
}

export async function notifyAdminsReportReady(opts: AdminNotifyOptions): Promise<void> {
  const { reportId, orgId, reportTitle, healthScore, topDiscoveries } = opts;

  // Find admin users for this org
  const admins = await prisma.user.findMany({
    where: { orgId, role: "ADMIN", email: { not: null } },
    select: { email: true, name: true },
  });

  if (admins.length === 0) {
    console.log("[NexFlow Notify] No admin users found for org", orgId);
    return;
  }

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const reviewUrl = `${baseUrl}/dashboard/admin/review`;

  // Health score badge
  const healthBadge = healthScore
    ? `<div style="display:inline-block;padding:6px 16px;border-radius:6px;background:#f0f0f0;margin:8px 0;">
        <span style="font-size:24px;font-weight:700;">${healthScore.overall}</span>
        <span style="font-size:12px;color:#666;margin-left:4px;">/ 100 · Grade ${healthScore.grade}</span>
       </div>`
    : "";

  // Top discoveries
  const discoveryList = topDiscoveries.length > 0
    ? `<ul style="margin:8px 0;padding-left:20px;font-size:13px;color:#333;">
        ${topDiscoveries.map((d) => `<li style="margin:4px 0;">${d}</li>`).join("")}
       </ul>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;">
        <tr>
          <td style="padding:20px 28px;border-bottom:2px solid #1a1a1a;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#1a1a1a;">NexFlow — Report Ready for Review</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a1a;">${reportTitle}</h2>
            <p style="margin:0 0 16px;font-size:13px;color:#888;">A new report has been generated and is waiting for your review.</p>
            ${healthBadge}
            ${discoveryList.length > 0 ? `<p style="margin:16px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;">Top discoveries</p>${discoveryList}` : ""}
            <div style="text-align:center;margin:24px 0;">
              <a href="${reviewUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Review Report</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #ddd;padding:14px 28px;">
            <p style="margin:0;font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;">Confidential — NexFlow Engineering Intelligence</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const emailPromises = admins
    .filter((a) => a.email)
    .map((admin) =>
      transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: admin.email!,
        subject: `📊 New report ready: ${reportTitle}`,
        html,
      }).catch((err) => {
        console.error(`[NexFlow Notify] Failed to email ${admin.email}:`, err);
      })
    );

  await Promise.allSettled(emailPromises);
  console.log(`[NexFlow Notify] Admin notifications sent to ${admins.length} admin(s)`);
}
