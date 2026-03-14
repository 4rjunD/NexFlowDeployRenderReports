import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface KpiItem {
  label: string;
  value: string;
  detail: string;
}

interface HealthScoreEmail {
  overall: number;
  grade: string;
  gradeColor: string;
  dimensions: { label: string; score: number; color: string }[];
}

interface SendReportEmailOptions {
  to: string;
  subject: string;
  reportTitle: string;
  orgName: string;
  kpis: KpiItem[];
  reportViewUrl: string;
  pdfDownloadUrl: string;
  healthScore?: HealthScoreEmail | null;
  topDiscoveries?: string[];
  recipientName?: string;
  recipientRole?: string;
  reportDepth?: string;
}

export async function sendReportEmail({
  to,
  subject,
  reportTitle,
  orgName,
  kpis,
  reportViewUrl,
  pdfDownloadUrl,
  healthScore = null,
  topDiscoveries = [],
  recipientName,
  recipientRole,
  reportDepth,
}: SendReportEmailOptions) {
  // Role-aware greeting and depth label
  const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "";
  const depthLabel = reportDepth === "EXECUTIVE" ? "Executive Summary" : reportDepth === "STANDARD" ? "Team Report" : "";
  const roleLabel = recipientRole ? recipientRole.replace(/_/g, " ") : "";

  // Health score for email — monochrome
  const healthHtml = healthScore
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px; border: 1px solid #ddd;">
        <tr>
          <td style="padding: 16px; text-align: center; width: 100px; border-right: 1px solid #ddd; background: #fafafa;">
            <div style="font-size: 32px; font-weight: 700; color: #1a1a1a; line-height: 1;">${healthScore.overall}</div>
            <div style="font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-top: 3px;">Health Index</div>
            <div style="font-size: 16px; font-weight: 700; color: #1a1a1a; margin-top: 1px;">${healthScore.grade}</div>
          </td>
          <td style="padding: 12px 16px; vertical-align: top;">
            ${healthScore.dimensions.map((d) => `
            <div style="margin-bottom: 4px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size: 10px; color: #666; width: 110px; padding-right: 6px;">${d.label}</td>
                  <td style="padding: 1px 0;">
                    <div style="background: #e5e5e5; height: 5px; width: 100%;">
                      <div style="background: #1a1a1a; height: 5px; width: ${d.score}%;"></div>
                    </div>
                  </td>
                  <td style="font-size: 10px; font-weight: 700; color: #1a1a1a; width: 28px; text-align: right;">${d.score}</td>
                </tr>
              </table>
            </div>`).join("")}
          </td>
        </tr>
      </table>`
    : "";

  // KPI strip
  const kpiHtml = kpis.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #ddd;">
        <tr>
          ${kpis.map((k) => `
          <td style="padding: 8px 10px; border-right: 1px solid #eee;">
            <div style="font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #888;">${k.label}</div>
            <div style="font-size: 18px; font-weight: 700; color: #1a1a1a; line-height: 1.2; margin-top: 1px;">${k.value}</div>
            <div style="font-size: 9px; color: #888;">${k.detail}</div>
          </td>`).join("")}
        </tr>
      </table>`
    : "";

  // Top discoveries preview
  const discoveriesHtml = topDiscoveries.length > 0
    ? `<div style="margin: 16px 0; padding: 12px 16px; background: #fafafa; border-left: 2px solid #1a1a1a;">
        <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px;">Key Findings</div>
        ${topDiscoveries.map((d) => `<div style="font-size: 12px; color: #333; margin-bottom: 4px; line-height: 1.5;">&#8226; ${d}</div>`).join("")}
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
          <tr>
            <td style="padding: 24px 28px; border-bottom: 2px solid #1a1a1a;">
              <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #1a1a1a;">NexFlow Engineering Intelligence</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 28px;">
              ${greeting ? `<p style="margin: 0 0 12px; font-size: 13px; color: #333;">${greeting}</p>` : ""}
              <h2 style="margin: 0 0 4px; font-size: 18px; color: #1a1a1a; font-weight: 700;">${reportTitle}</h2>
              <div style="margin: 0 0 16px; display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 11px; color: #888;">Prepared for ${orgName}</span>
                ${depthLabel ? `<span style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; background: #1a1a1a; padding: 2px 8px; border-radius: 3px;">${depthLabel}</span>` : ""}
              </div>

              ${healthHtml}
              ${kpiHtml}
              ${discoveriesHtml}

              <p style="margin: 0 0 16px; font-size: 12px; line-height: 1.6; color: #333;">
                Your full engineering report is ready. It includes health index scoring, delivery metrics, code review analysis, risk signals, and prioritized recommendations.
              </p>

              <div style="text-align: center; margin: 24px 0;">
                <a href="${reportViewUrl}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">View Full Report</a>
              </div>

              <p style="margin: 0; font-size: 11px; color: #aaa; text-align: center;">
                <a href="${pdfDownloadUrl}" style="color: #888; text-decoration: underline;">Download as PDF</a>
              </p>

              <p style="margin: 16px 0 0; font-size: 12px; line-height: 1.6; color: #333;">
                Reply to this email with questions or feedback.
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #ddd; padding: 16px 28px;">
              <p style="margin: 0; font-size: 9px; color: #aaa; text-transform: uppercase; letter-spacing: 0.5px;">
                Confidential — intended for the recipient only
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });

  return result;
}

interface SendOnboardingEmailOptions {
  to: string;
  clientName: string;
  companyName: string;
  setupUrl: string;
}

export async function sendOnboardingEmail({
  to,
  clientName,
  companyName,
  setupUrl,
}: SendOnboardingEmailOptions) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%); padding: 28px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">NexFlow</h1>
              <p style="margin: 4px 0 0; color: #93c5fd; font-size: 12px;">Engineering Intelligence</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 22px; color: #111827;">Welcome to NexFlow, ${clientName}!</h2>
              <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #374151;">
                You have been invited to set up <strong>${companyName}</strong> on NexFlow, our AI-powered engineering reporting platform.
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #374151;">
                Click the button below to connect your tools (GitHub, Slack, Linear, Google Calendar) and start receiving comprehensive engineering reports.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${setupUrl}" style="display: inline-block; background-color: #1e40af; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">Set Up Your Account</a>
              </div>
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af;">
                This link will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #e5e7eb; padding: 20px 32px; background: #f9fafb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                NexFlow — AI-Powered Engineering Reports. If you have questions, reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `Welcome to NexFlow — Set up ${companyName}`,
    html,
  });

  return result;
}
