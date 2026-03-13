// ─────────────────────────────────────────────────────────────
// Slack Blocker Detection — Identify blocked work from message patterns
// Cross-references with Jira ticket keys when available
// ─────────────────────────────────────────────────────────────

import type { RawChannelMessages } from "./metrics";

// ── Types ──

export interface BlockerSignal {
  channelName: string;
  userId: string;
  messageSnippet: string; // Truncated to ~200 chars
  timestamp: string; // ISO
  matchedKeyword: string;
  referencedTickets: string[]; // e.g. ["PAY-412"]
  confidence: "high" | "medium";
}

export interface BlockerReport {
  blockers: BlockerSignal[];
  totalMessagesScanned: number;
  channelsScanned: number;
}

// ── Constants ──

const BLOCKER_KEYWORDS = [
  "blocked by",
  "blocking",
  "waiting on",
  "waiting for",
  "need this before",
  "needs to be done before",
  "any update on",
  "depends on",
  "dependency on",
  "can't proceed",
  "cannot proceed",
  "stuck on",
  "stuck waiting",
  "blocker",
  "unblocked",
];

// Matches Jira-style keys: PAY-412, CORE-1234, etc.
const TICKET_KEY_REGEX = /\b[A-Z]{2,10}-\d+\b/g;

// ── Core ──

export function detectSlackBlockers(
  rawMessages: RawChannelMessages[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jiraData?: Record<string, any> | null
): BlockerReport {
  if (!rawMessages || rawMessages.length === 0) {
    return { blockers: [], totalMessagesScanned: 0, channelsScanned: 0 };
  }

  // Build a set of known Jira ticket keys for cross-referencing
  const knownTicketKeys = new Set<string>();
  if (jiraData?.issues) {
    // From overdue issues
    if (Array.isArray(jiraData.issues.overdue)) {
      for (const issue of jiraData.issues.overdue) {
        if (issue.key) knownTicketKeys.add(issue.key);
      }
    }
    // From recently completed
    if (Array.isArray(jiraData.issues.recentlyCompleted)) {
      for (const issue of jiraData.issues.recentlyCompleted) {
        if (issue.key) knownTicketKeys.add(issue.key);
      }
    }
  }
  // From active sprint
  if (jiraData?.sprints?.active?.issueBreakdown) {
    for (const issue of jiraData.sprints.active.issueBreakdown) {
      if (issue.key) knownTicketKeys.add(issue.key);
    }
  }
  // From deliverables (epics)
  if (Array.isArray(jiraData?.deliverables)) {
    for (const d of jiraData.deliverables) {
      if (d.key) knownTicketKeys.add(d.key);
    }
  }

  const blockers: BlockerSignal[] = [];
  let totalMessagesScanned = 0;

  for (const channel of rawMessages) {
    for (const msg of channel.messages) {
      totalMessagesScanned++;

      if (!msg.text) continue;

      const textLower = msg.text.toLowerCase();

      // Check for blocker keywords
      let matchedKeyword: string | null = null;
      for (const keyword of BLOCKER_KEYWORDS) {
        if (textLower.includes(keyword)) {
          // Skip if it's "unblocked" in a positive context
          if (keyword === "blocker" && textLower.includes("no blocker")) continue;
          if (keyword === "blocker" && textLower.includes("unblocked")) continue;
          matchedKeyword = keyword;
          break;
        }
      }

      if (!matchedKeyword) continue;

      // Extract referenced ticket keys
      const ticketMatches = msg.text.match(TICKET_KEY_REGEX) || [];
      const referencedTickets = Array.from(new Set(ticketMatches));

      // Determine confidence
      const hasKnownTicket = referencedTickets.some((t) => knownTicketKeys.has(t));
      const confidence: "high" | "medium" = hasKnownTicket ? "high" : "medium";

      // Truncate message for snippet
      const snippet = msg.text.length > 200
        ? msg.text.slice(0, 197) + "..."
        : msg.text;

      blockers.push({
        channelName: channel.channelName,
        userId: msg.user || "unknown",
        messageSnippet: snippet,
        timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        matchedKeyword,
        referencedTickets,
        confidence,
      });
    }
  }

  // Sort by timestamp descending (most recent first), cap at 25
  blockers.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    blockers: blockers.slice(0, 25),
    totalMessagesScanned,
    channelsScanned: rawMessages.length,
  };
}
