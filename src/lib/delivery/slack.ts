// ─────────────────────────────────────────────────────────────
// NexFlow — Slack Report Delivery
// Posts a rich Slack message with health score, top discoveries,
// and a link to the full report PDF.
// ─────────────────────────────────────────────────────────────

import prisma from "@/lib/db/prisma";
import { decryptToken } from "@/lib/crypto";

interface SlackDeliveryOptions {
  orgId: string;
  reportId: string;
  channel: string; // e.g. "#eng-leadership" or "C04ABC123"
  healthScore: { overall: number; grade: string } | null;
  discoveries: { headline: string; color: string }[];
  actionItems: { priority: string; title: string }[];
  reportTitle: string;
  reportUrl?: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: { type: string; text?: string | { type: string; text: string }; url?: string; style?: { bold?: boolean } }[];
  fields?: { type: string; text: string }[];
  block_id?: string;
}

export async function deliverReportToSlack(opts: SlackDeliveryOptions): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const { orgId, channel, healthScore, discoveries, actionItems, reportTitle, reportUrl } = opts;

  // Get Slack integration for this org
  const integration = await prisma.integration.findFirst({
    where: { orgId, type: "SLACK", status: "CONNECTED" },
  });

  if (!integration?.accessToken) {
    return { ok: false, error: "Slack integration not connected or missing access token" };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(integration.accessToken);
  } catch {
    accessToken = integration.accessToken;
  }

  // Build Slack blocks for rich message
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `📊 ${reportTitle}`, emoji: true },
  });

  // Health score
  if (healthScore) {
    const emoji = healthScore.overall >= 80 ? "🟢" : healthScore.overall >= 60 ? "🔵" : healthScore.overall >= 40 ? "🟡" : "🔴";
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *Engineering Health: ${healthScore.overall}/100* (Grade: ${healthScore.grade})`,
      },
    });
  }

  blocks.push({ type: "divider" });

  // Top 3 discoveries
  if (discoveries.length > 0) {
    const colorEmoji: Record<string, string> = {
      red: "🔴", amber: "🟡", green: "🟢", blue: "🔵", purple: "🟣", neutral: "⚪",
    };

    const discoveryText = discoveries.slice(0, 3).map((d) => {
      const emoji = colorEmoji[d.color] || "⚪";
      return `${emoji} ${d.headline}`;
    }).join("\n\n");

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Top Discoveries:*\n${discoveryText}` },
    });
  }

  // Action items in thread (we'll post these as a threaded reply)
  if (reportUrl) {
    blocks.push({
      type: "actions",
      elements: [{
        type: "button",
        text: { type: "plain_text", text: "View Full Report" },
        url: reportUrl,
        style: { bold: true },
      }],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `_NexFlow Engineering Intelligence · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}_` }],
  });

  // Resolve channel name to ID if needed
  const channelId = channel.startsWith("C") ? channel : await resolveChannelId(accessToken, channel);
  if (!channelId) {
    return { ok: false, error: `Could not resolve Slack channel: ${channel}` };
  }

  // Post the main message
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      channel: channelId,
      text: `${reportTitle} — Health: ${healthScore?.overall ?? "N/A"}/100`,
      blocks,
      unfurl_links: false,
    }),
  });

  const result = await response.json() as { ok: boolean; ts?: string; error?: string };

  if (!result.ok) {
    return { ok: false, error: result.error || "Failed to post Slack message" };
  }

  // Post action items as a threaded reply
  if (actionItems.length > 0 && result.ts) {
    const priorityEmoji: Record<string, string> = { P1: "🔴", P2: "🟡", P3: "🔵" };
    const threadText = "*Recommended Actions:*\n" +
      actionItems.slice(0, 5).map((a) => `${priorityEmoji[a.priority] || "⚪"} *[${a.priority}]* ${a.title}`).join("\n");

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        channel: channelId,
        thread_ts: result.ts,
        text: threadText,
        blocks: [{
          type: "section",
          text: { type: "mrkdwn", text: threadText },
        }],
      }),
    });
  }

  return { ok: true, ts: result.ts };
}

async function resolveChannelId(accessToken: string, channelName: string): Promise<string | null> {
  const cleanName = channelName.replace(/^#/, "");

  const response = await fetch(`https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json() as { ok: boolean; channels?: { id: string; name: string }[] };
  if (!data.ok || !data.channels) return null;

  const match = data.channels.find((c) => c.name === cleanName);
  return match?.id || null;
}
