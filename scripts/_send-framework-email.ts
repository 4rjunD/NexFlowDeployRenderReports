/**
 * Send the Contributor Onboarding Framework email with NexFlow email design.
 * Links to the Render-hosted HTML.
 */
import "../src/lib/db/prisma";
import nodemailer from "nodemailer";

const TO = process.argv[2] || "arjundixit3508@gmail.com";
const RECIPIENT_NAME = process.argv[3] || "Nick";
const RENDER_URL = "https://nexflowdeployrenderreports.onrender.com/resourceful-onboarding-framework.html";

async function main() {
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
            <td style="padding: 32px 36px 24px; background: #fafafa; border-bottom: 1px solid #e5e5ea;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: #8c8c8c; text-transform: uppercase;">NexFlow</div>
                  </td>
                  <td align="right">
                    <div style="display: inline-block; font-size: 10px; font-weight: 700; padding: 4px 12px; border-radius: 6px; background: #8b5cf6; color: #ffffff; letter-spacing: 0.3px;">Framework</div>
                  </td>
                </tr>
              </table>
              <div style="margin-top: 16px; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #0f0f0f; line-height: 1.1;">Resourceful</div>
              <div style="margin-top: 6px; font-size: 13px; color: #3a3a3a; font-weight: 500;">Contributor Onboarding Framework</div>
              <div style="margin-top: 20px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #0f0f0f 0%, #3b82f6 50%, #8b5cf6 100%);"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 36px;">

              <p style="margin: 0 0 16px; font-size: 14px; color: #0f0f0f; font-weight: 600;">Hi ${firstName},</p>

              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7; color: #3a3a3a;">
                Your Contributor Onboarding Framework for Resourceful is ready. We analyzed your GitHub repositories and mapped out exactly what needs to happen to take you from a solo operation to a team of 10-30 contributors — without breaking what already works.
              </p>

              <!-- Scale Readiness Score -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5ea;">
                <tr>
                  <td style="padding: 20px 24px; text-align: center; width: 110px; background: #f7f7f8; border-right: 1px solid #e5e5ea;">
                    <div style="font-size: 42px; font-weight: 900; color: #e5484d; line-height: 1; letter-spacing: -2px;">28</div>
                    <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #8c8c8c; margin-top: 4px;">Scale Readiness</div>
                    <div style="display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 6px; background: #e5484d; color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">Grade D</div>
                  </td>
                  <td style="padding: 16px 20px; vertical-align: top;">
                    <div style="margin-bottom: 6px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font-size: 11px; color: #3a3a3a; width: 120px; padding-right: 8px; font-weight: 500;">Process</td>
                          <td style="padding: 2px 0;">
                            <div style="background: #e5e5ea; height: 6px; border-radius: 3px; width: 100%;">
                              <div style="background: #e5484d; height: 6px; border-radius: 3px; width: 15%;"></div>
                            </div>
                          </td>
                          <td style="font-size: 11px; font-weight: 800; color: #e5484d; width: 30px; text-align: right;">15</td>
                        </tr>
                      </table>
                    </div>
                    <div style="margin-bottom: 6px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font-size: 11px; color: #3a3a3a; width: 120px; padding-right: 8px; font-weight: 500;">Code Review</td>
                          <td style="padding: 2px 0;">
                            <div style="background: #e5e5ea; height: 6px; border-radius: 3px; width: 100%;">
                              <div style="background: #e5484d; height: 6px; border-radius: 3px; width: 20%;"></div>
                            </div>
                          </td>
                          <td style="font-size: 11px; font-weight: 800; color: #e5484d; width: 30px; text-align: right;">20</td>
                        </tr>
                      </table>
                    </div>
                    <div style="margin-bottom: 6px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font-size: 11px; color: #3a3a3a; width: 120px; padding-right: 8px; font-weight: 500;">Documentation</td>
                          <td style="padding: 2px 0;">
                            <div style="background: #e5e5ea; height: 6px; border-radius: 3px; width: 100%;">
                              <div style="background: #e5940c; height: 6px; border-radius: 3px; width: 40%;"></div>
                            </div>
                          </td>
                          <td style="font-size: 11px; font-weight: 800; color: #e5940c; width: 30px; text-align: right;">40</td>
                        </tr>
                      </table>
                    </div>
                    <div style="margin-bottom: 6px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font-size: 11px; color: #3a3a3a; width: 120px; padding-right: 8px; font-weight: 500;">Standards</td>
                          <td style="padding: 2px 0;">
                            <div style="background: #e5e5ea; height: 6px; border-radius: 3px; width: 100%;">
                              <div style="background: #e5940c; height: 6px; border-radius: 3px; width: 35%;"></div>
                            </div>
                          </td>
                          <td style="font-size: 11px; font-weight: 800; color: #e5940c; width: 30px; text-align: right;">35</td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Key Findings -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px; border-radius: 12px; overflow: hidden; border: 1px solid #e5e5ea;">
                <tr>
                  <td style="padding: 16px 20px; background: #f7f7f8;">
                    <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #8c8c8c; margin-bottom: 10px;">What's Inside</div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
                      <tr>
                        <td width="8" valign="top" style="padding-top: 6px;">
                          <div style="width: 5px; height: 5px; border-radius: 50%; background: #e5484d;"></div>
                        </td>
                        <td style="font-size: 13px; color: #3a3a3a; line-height: 1.5; padding-left: 10px; font-weight: 500;">Current state analysis — no review gates, no safety net for code changes</td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
                      <tr>
                        <td width="8" valign="top" style="padding-top: 6px;">
                          <div style="width: 5px; height: 5px; border-radius: 50%; background: #3b82f6;"></div>
                        </td>
                        <td style="font-size: 13px; color: #3a3a3a; line-height: 1.5; padding-left: 10px; font-weight: 500;">Branch strategy, PR templates, and automated code review system</td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
                      <tr>
                        <td width="8" valign="top" style="padding-top: 6px;">
                          <div style="width: 5px; height: 5px; border-radius: 50%; background: #e5940c;"></div>
                        </td>
                        <td style="font-size: 13px; color: #3a3a3a; line-height: 1.5; padding-left: 10px; font-weight: 500;">Tech debt triage (P0/P1/P2) with prioritized fix timeline</td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
                      <tr>
                        <td width="8" valign="top" style="padding-top: 6px;">
                          <div style="width: 5px; height: 5px; border-radius: 50%; background: #30a46c;"></div>
                        </td>
                        <td style="font-size: 13px; color: #3a3a3a; line-height: 1.5; padding-left: 10px; font-weight: 500;">Day 1 / Week 1 / Month 1 contributor onboarding checklist</td>
                      </tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
                      <tr>
                        <td width="8" valign="top" style="padding-top: 6px;">
                          <div style="width: 5px; height: 5px; border-radius: 50%; background: #8b5cf6;"></div>
                        </td>
                        <td style="font-size: 13px; color: #3a3a3a; line-height: 1.5; padding-left: 10px; font-weight: 500;">30-60-90 day roadmap — NexFlow handles technical, you handle product</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius: 10px; background: #0f0f0f;">
                          <a href="${RENDER_URL}" target="_blank" style="display: inline-block; padding: 14px 36px; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: -0.2px;">View Full Framework</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.6; color: #3a3a3a;">
                Reply to this email with any questions, or we can walk through it together on a call.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid #e5e5ea; padding: 20px 36px; background: #f7f7f8;">
              <div style="font-size: 9px; font-weight: 700; letter-spacing: 2px; color: #8c8c8c; text-transform: uppercase; margin-bottom: 4px;">NexFlow</div>
              <p style="margin: 0; font-size: 10px; color: #8c8c8c;">
                Confidential framework · Prepared for Resourceful
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
    to: TO,
    subject: `${firstName}, Your Contributor Onboarding Framework is Ready`,
    html,
  });

  console.log("Sent to:", TO);
  console.log("MessageId:", result.messageId);
  console.log("Response:", result.response);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
