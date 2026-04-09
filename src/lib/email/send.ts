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
  healthScoreDelta?: number | null;
  topDiscoveries?: string[];
  recipientName?: string;
  recipientRole?: string;
  reportDepth?: string;
  unsubscribeUrl?: string;
  nextReportDate?: string;
  customMessage?: string;
  attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
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
  healthScoreDelta = null,
  topDiscoveries = [],
  recipientName,
  recipientRole,
  reportDepth,
  unsubscribeUrl,
  nextReportDate,
  customMessage,
  attachments,
}: SendReportEmailOptions) {
  const firstName = recipientName ? recipientName.split(" ")[0] : "";
  const depthLabel = reportDepth === "EXECUTIVE" ? "Executive Summary" : reportDepth === "STANDARD" ? "Team Report" : "";

  // Health score color
  const scoreColor = healthScore
    ? healthScore.overall >= 80 ? "#30a46c" : healthScore.overall >= 60 ? "#3b82f6" : healthScore.overall >= 40 ? "#e5940c" : "#e5484d"
    : "#888";

  // Health score card
  const healthHtml = healthScore
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5ea;">
        <tr>
          <td style="padding: 20px 24px; text-align: center; width: 110px; background: #f7f7f8; border-right: 1px solid #e5e5ea;">
            <div style="font-size: 42px; font-weight: 900; color: ${scoreColor}; line-height: 1; letter-spacing: -2px;">${healthScore.overall}</div>
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #8c8c8c; margin-top: 4px;">Health Index</div>
            <div style="display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 6px; background: ${scoreColor}; color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">Grade ${healthScore.grade}</div>
            ${healthScoreDelta != null && healthScoreDelta !== 0
              ? `<div style="font-size: 11px; font-weight: 700; color: ${healthScoreDelta > 0 ? '#30a46c' : '#e5484d'}; margin-top: 4px;">${healthScoreDelta > 0 ? '+' : ''}${healthScoreDelta} vs prior</div>`
              : '<div style="font-size: 10px; color: #8c8c8c; margin-top: 4px;">First report</div>'}
          </td>
          <td style="padding: 16px 20px; vertical-align: top;">
            ${healthScore.dimensions.map((d) => {
              const barColor = d.score >= 80 ? "#30a46c" : d.score >= 60 ? "#3b82f6" : d.score >= 40 ? "#e5940c" : "#e5484d";
              return `
            <div style="margin-bottom: 6px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size: 11px; color: #3a3a3a; width: 120px; padding-right: 8px; font-weight: 500;">${d.label}</td>
                  <td style="padding: 2px 0;">
                    <div style="background: #e5e5ea; height: 6px; border-radius: 3px; width: 100%;">
                      <div style="background: ${barColor}; height: 6px; border-radius: 3px; width: ${d.score}%;"></div>
                    </div>
                  </td>
                  <td style="font-size: 11px; font-weight: 800; color: ${barColor}; width: 30px; text-align: right;">${d.score}</td>
                </tr>
              </table>
            </div>`;
            }).join("")}
          </td>
        </tr>
      </table>`
    : "";

  // Discoveries
  const discoveriesHtml = topDiscoveries.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5ea;">
        <tr>
          <td style="padding: 16px 20px; background: #f7f7f8;">
            <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #8c8c8c; margin-bottom: 10px;">Key Findings</div>
            ${topDiscoveries.map((d) => `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
              <tr>
                <td width="8" valign="top" style="padding-top: 6px;">
                  <div style="width: 5px; height: 5px; border-radius: 50%; background: #0f0f0f;"></div>
                </td>
                <td style="font-size: 13px; color: #3a3a3a; line-height: 1.5; padding-left: 10px; font-weight: 500;">${d}</td>
              </tr>
            </table>`).join("")}
          </td>
        </tr>
      </table>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><style>body{font-family:Arial,sans-serif !important}</style><![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #eeeef0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eeeef0; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 24px; background: #fafafa; border-bottom: 1px solid #e5e5ea; position: relative;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: #8c8c8c; text-transform: uppercase;">NexFlow</div>
                  </td>
                  <td align="right">
                    <div style="display: inline-block; font-size: 10px; font-weight: 700; padding: 4px 12px; border-radius: 6px; background: #0f0f0f; color: #ffffff; letter-spacing: 0.3px;">Brief #1</div>
                  </td>
                </tr>
              </table>
              <div style="margin-top: 16px; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #0f0f0f; line-height: 1.1;">${orgName}</div>
              <div style="margin-top: 6px; font-size: 13px; color: #3a3a3a; font-weight: 500;">${reportTitle}</div>
              ${depthLabel ? `<div style="margin-top: 6px;"><span style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; background: #0f0f0f; padding: 3px 10px; border-radius: 4px;">${depthLabel}</span></div>` : ""}
              <!-- Gradient bar -->
              <div style="margin-top: 20px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #0f0f0f 0%, #3b82f6 50%, #8b5cf6 100%);"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 36px;">

              ${firstName ? `<p style="margin: 0 0 16px; font-size: 14px; color: #0f0f0f; font-weight: 600;">Hi ${firstName},</p>` : ""}

              ${customMessage
                ? `<p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #3a3a3a;">${customMessage}</p>`
                : `<p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #3a3a3a;">Your engineering brief is ready. It includes health scoring, risk analysis, and prioritized recommendations from your NexFlow consulting team.</p>`}

              ${healthHtml}
              ${discoveriesHtml}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius: 10px; background: #0f0f0f;">
                          <a href="${reportViewUrl}" target="_blank" style="display: inline-block; padding: 14px 36px; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: -0.2px;">View Your Full Brief</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-size: 11px; color: #8c8c8c; text-align: center;">
                <a href="${pdfDownloadUrl}" style="color: #8c8c8c; text-decoration: underline; font-weight: 500;">Download as PDF</a>
              </p>

              <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #3a3a3a;">
                Reply to this email with any questions. Or <a href="https://calendly.com/arjundixit3508/30min" style="color: #0f0f0f; font-weight: 700; text-decoration: underline;">book a call</a> and we'll walk through it together.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid #e5e5ea; padding: 20px 36px; background: #f7f7f8;">
              ${nextReportDate ? `<p style="margin: 0 0 6px; font-size: 11px; color: #3a3a3a; font-weight: 600;">Your next report arrives <strong>${nextReportDate}</strong></p>` : ""}
              <div style="font-size: 9px; font-weight: 700; letter-spacing: 2px; color: #8c8c8c; text-transform: uppercase; margin-bottom: 4px;">NexFlow</div>
              <p style="margin: 0; font-size: 10px; color: #8c8c8c;">
                Confidential consulting brief · Prepared for ${orgName}
              </p>
              ${unsubscribeUrl ? `<p style="margin: 6px 0 0; font-size: 9px;"><a href="${unsubscribeUrl}" style="color: #bbb; text-decoration: underline;">Unsubscribe from reports</a></p>` : ""}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const mailOptions: Record<string, any> = {
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    ...(attachments?.length ? { attachments } : {}),
  };

  // Add List-Unsubscribe header for email client native unsubscribe
  if (unsubscribeUrl) {
    mailOptions.headers = {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  const result = await transporter.sendMail(mailOptions);

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
<body style="margin: 0; padding: 0; background-color: #eeeef0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eeeef0; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding: 32px 36px 24px; background: #fafafa; border-bottom: 1px solid #e5e5ea;">
              <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: #8c8c8c; text-transform: uppercase;">NexFlow</div>
              <div style="margin-top: 16px; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f0f0f;">Welcome, ${clientName}</div>
              <div style="margin-top: 6px; font-size: 13px; color: #3a3a3a; font-weight: 500;">Your engineering consulting is ready to set up</div>
              <div style="margin-top: 20px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #0f0f0f 0%, #3b82f6 50%, #8b5cf6 100%);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 36px;">
              <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.7; color: #3a3a3a;">
                <strong>${companyName}</strong> is being onboarded to NexFlow, your embedded AI engineering consulting partner.
              </p>
              <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.7; color: #3a3a3a;">
                We work alongside your engineering leadership directly inside your codebase &mdash; auditing your workflow, identifying bottlenecks, and implementing improvements hands-on.
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #3a3a3a;">
                Click below to connect your GitHub and submit your engineering workflow for audit.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius: 10px; background: #0f0f0f;">
                          <a href="${setupUrl}" style="display: inline-block; padding: 14px 36px; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none;">Set Up Your Account</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 12px; color: #8c8c8c;">
                This link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #e5e5ea; padding: 20px 36px; background: #f7f7f8;">
              <div style="font-size: 9px; font-weight: 700; letter-spacing: 2px; color: #8c8c8c; text-transform: uppercase; margin-bottom: 4px;">NexFlow</div>
              <p style="margin: 0; font-size: 10px; color: #8c8c8c;">
                Embedded AI Engineering Consulting. Reply to this email with questions.
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
    subject: `Welcome to NexFlow: Set up ${companyName}`,
    html,
  });

  return result;
}
