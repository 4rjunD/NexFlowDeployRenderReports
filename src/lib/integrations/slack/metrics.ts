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

export interface RawChannelMessages {
  channelName: string
  messages: { user?: string; text: string; ts: string }[]
}

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
  avgThreadResponseMinutes: number | null
  messagesByDayOfWeek: Record<string, number>
  afterHoursMessagePct: number
  peakDay: string
  quietestDay: string
  silentChannels: string[]
  periodStart: string
  periodEnd: string
  /** Raw messages from the last 14 days for blocker detection. Stripped before DB persistence. */
  _rawMessages?: RawChannelMessages[]
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
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const messagesByDayOfWeek: Record<string, number> = {
    Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0,
  }
  let afterHoursCount = 0
  let totalUserMessages = 0
  const allThreadResponseMinutes: number[] = []
  const activeChannelNames = new Set<string>()

  for (const { channel, messages } of channelMessages) {
    // Only count actual user messages (exclude system subtypes)
    const userMessages = messages.filter(
      (m) => m.user && !m.subtype
    )

    if (userMessages.length > 0) {
      activeChannels++
      activeChannelNames.add(channel.name)
    }

    totalMessages += userMessages.length
    totalUserMessages += userMessages.length

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
      const dateStr = date.toISOString().slice(0, 10)
      messagesByDay[dateStr] = (messagesByDay[dateStr] ?? 0) + 1

      // Day-of-week analysis
      const dayName = dayNames[date.getUTCDay()]
      messagesByDayOfWeek[dayName] = (messagesByDayOfWeek[dayName] ?? 0) + 1

      // After-hours analysis (before 9am or after 6pm UTC)
      const hour = date.getUTCHours()
      if (hour < 9 || hour >= 18) {
        afterHoursCount++
      }
    }

    // Response time: look at messages that are thread parents with replies
    const threadParents = userMessages.filter(
      (m) => m.reply_count && m.reply_count > 0 && m.thread_ts === m.ts
    )

    if (threadParents.length > 0) {
      const channelResponseMinutes: number[] = []

      for (const parent of threadParents) {
        // Find the first reply: messages where thread_ts matches parent ts but ts !== thread_ts
        const replies = messages
          .filter((m) => m.thread_ts === parent.ts && m.ts !== parent.ts)
          .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))

        if (replies.length > 0) {
          const parentTime = parseFloat(parent.ts)
          const firstReplyTime = parseFloat(replies[0].ts)
          const responseMinutes = (firstReplyTime - parentTime) / 60
          if (responseMinutes > 0) {
            channelResponseMinutes.push(responseMinutes)
          }
        }
      }

      const avgResponseMinutes =
        channelResponseMinutes.length > 0
          ? Math.round(
              (channelResponseMinutes.reduce((a, b) => a + b, 0) /
                channelResponseMinutes.length) *
                10
            ) / 10
          : null

      responseTimeByChannel.push({
        channelId: channel.id,
        channelName: channel.name,
        avgResponseMinutes,
      })

      allThreadResponseMinutes.push(...channelResponseMinutes)
    }
  }

  // Compute top-level avg thread response time
  const avgThreadResponseMinutes =
    allThreadResponseMinutes.length > 0
      ? Math.round(
          (allThreadResponseMinutes.reduce((a, b) => a + b, 0) /
            allThreadResponseMinutes.length) *
            10
        ) / 10
      : null

  // After-hours percentage
  const afterHoursMessagePct =
    totalUserMessages > 0
      ? Math.round((afterHoursCount / totalUserMessages) * 1000) / 10
      : 0

  // Peak and quietest day
  const dayEntries = Object.entries(messagesByDayOfWeek)
  const peakDay =
    dayEntries.length > 0
      ? dayEntries.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      : "Mon"
  const quietestDay =
    dayEntries.length > 0
      ? dayEntries.reduce((a, b) => (b[1] < a[1] ? b : a))[0]
      : "Sun"

  // Silent channels: targetChannels with 0 messages
  const silentChannels = targetChannels
    .filter((c) => !activeChannelNames.has(c.name))
    .map((c) => c.name)

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

  // Build raw messages for blocker detection (last 14 days only, capped)
  const fourteenDaysAgo = Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000)
  const rawMessages: RawChannelMessages[] = []

  for (const { channel, messages } of channelMessages) {
    const recentUserMsgs = messages
      .filter((m) => m.user && !m.subtype && m.text && parseFloat(m.ts) >= fourteenDaysAgo)
      .slice(0, 500) // Cap per channel
      .map((m) => ({ user: m.user, text: m.text || "", ts: m.ts }))

    if (recentUserMsgs.length > 0) {
      rawMessages.push({ channelName: channel.name, messages: recentUserMsgs })
    }
  }

  return {
    totalMessages,
    activeChannels,
    totalChannels: channels.length,
    topContributors,
    messagesByDay,
    responseTimeByChannel,
    avgThreadResponseMinutes,
    messagesByDayOfWeek,
    afterHoursMessagePct,
    peakDay,
    quietestDay,
    silentChannels,
    periodStart: since.toISOString(),
    periodEnd: new Date().toISOString(),
    _rawMessages: rawMessages,
  }
}
