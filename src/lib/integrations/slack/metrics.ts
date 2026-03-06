// ─────────────────────────────────────────────────────────────
// Slack metrics collection
// ─────────────────────────────────────────────────────────────

import {
  fetchSlackChannels,
  fetchSlackMessages,
  fetchSlackUsers,
  type SlackMessage,
  type SlackUser,
} from "./client"

export interface SlackMetrics {
  totalMessages: number
  activeChannels: number
  totalChannels: number
  topContributors: {
    userId: string
    displayName: string
    messageCount: number
  }[]
  messagesByDay: Record<string, number>
  responseTimeByChannel: {
    channelId: string
    channelName: string
    avgResponseMinutes: number | null
  }[]
  periodStart: string
  periodEnd: string
}

// Batch channels to avoid hitting Slack's rate limits (~50 req/min for Tier 3)
async function batchFetchMessages(
  accessToken: string,
  channels: { id: string; name: string }[],
  oldestTs: number,
  batchSize = 8
): Promise<{ channel: { id: string; name: string }; messages: SlackMessage[] }[]> {
  const results: { channel: { id: string; name: string }; messages: SlackMessage[] }[] = []

  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(async (channel) => {
        const messages = await fetchSlackMessages(
          accessToken,
          channel.id,
          oldestTs,
          2000 // cap per channel
        )
        return { channel, messages }
      })
    )

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value)
      } else {
        // Channel fetch failed (bot not in channel, etc) — skip
      }
    }

    // Small delay between batches to respect rate limits
    if (i + batchSize < channels.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return results
}

export async function collectSlackMetrics(
  accessToken: string,
  since: Date
): Promise<SlackMetrics> {
  const oldestTs = Math.floor(since.getTime() / 1000)

  // Fetch channels and users in parallel
  const [channels, users] = await Promise.all([
    fetchSlackChannels(accessToken),
    fetchSlackUsers(accessToken),
  ])

  // Build a user lookup for display names
  const userMap = new Map<string, SlackUser>()
  for (const user of users) {
    if (!user.is_bot && !user.deleted) {
      userMap.set(user.id, user)
    }
  }

  // Only fetch from channels with members (active channels), cap at 50 channels
  const targetChannels = channels
    .filter((c) => c.is_member && !c.is_archived)
    .sort((a, b) => b.num_members - a.num_members)
    .slice(0, 50)

  const channelMessages = await batchFetchMessages(
    accessToken,
    targetChannels,
    oldestTs
  )

  // ── Aggregate metrics ──────────────────────────────────

  let totalMessages = 0
  let activeChannels = 0
  const contributorCounts = new Map<string, number>()
  const messagesByDay: Record<string, number> = {}
  const responseTimeByChannel: SlackMetrics["responseTimeByChannel"] = []

  for (const { channel, messages } of channelMessages) {
    // Only count actual user messages (exclude system subtypes)
    const userMessages = messages.filter(
      (m) => m.user && !m.subtype
    )

    if (userMessages.length > 0) {
      activeChannels++
    }

    totalMessages += userMessages.length

    for (const msg of userMessages) {
      // Contributor counts
      if (msg.user) {
        contributorCounts.set(
          msg.user,
          (contributorCounts.get(msg.user) ?? 0) + 1
        )
      }

      // Messages by day
      const date = new Date(parseFloat(msg.ts) * 1000)
        .toISOString()
        .slice(0, 10)
      messagesByDay[date] = (messagesByDay[date] ?? 0) + 1
    }

    // Response time: look at messages that are thread parents with replies
    const threadParents = userMessages.filter(
      (m) => m.reply_count && m.reply_count > 0 && m.thread_ts === m.ts
    )

    if (threadParents.length > 0) {
      responseTimeByChannel.push({
        channelId: channel.id,
        channelName: channel.name,
        avgResponseMinutes: null,
      })
    }
  }

  // Build top contributors list
  const topContributors = Array.from(contributorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, messageCount]) => {
      const user = userMap.get(userId)
      return {
        userId,
        displayName:
          user?.profile.display_name || user?.real_name || userId,
        messageCount,
      }
    })

  return {
    totalMessages,
    activeChannels,
    totalChannels: channels.length,
    topContributors,
    messagesByDay,
    responseTimeByChannel,
    periodStart: since.toISOString(),
    periodEnd: new Date().toISOString(),
  }
}
