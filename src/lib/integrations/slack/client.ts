// ─────────────────────────────────────────────────────────────
// Slack API client helpers
// ─────────────────────────────────────────────────────────────

const SLACK_API = "https://slack.com/api"

interface SlackApiResponse {
  ok: boolean
  error?: string
}

async function slackFetch<T extends SlackApiResponse>(
  endpoint: string,
  token: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${SLACK_API}/${endpoint}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    // Handle Slack rate limiting (HTTP 429)
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "5")
      console.warn(`[Slack] Rate limited on ${endpoint}. Retry after ${retryAfter}s.`)
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      // Retry once
      const retry = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
      if (!retry.ok) {
        throw new Error(`Slack API ${endpoint} failed after retry: ${retry.statusText}`)
      }
      const retryData: T = await retry.json()
      if (!retryData.ok) {
        throw new Error(`Slack API ${endpoint} error after retry: ${retryData.error ?? "unknown"}`)
      }
      return retryData
    }
    throw new Error(`Slack API ${endpoint} failed: ${response.statusText}`)
  }

  const data: T = await response.json()

  if (!data.ok) {
    throw new Error(`Slack API ${endpoint} error: ${data.error ?? "unknown"}`)
  }

  return data
}

// ── Channel types ──────────────────────────────────────────

export interface SlackChannel {
  id: string
  name: string
  is_channel: boolean
  is_archived: boolean
  is_member: boolean
  num_members: number
  topic: { value: string }
  purpose: { value: string }
}

interface ChannelsResponse extends SlackApiResponse {
  channels: SlackChannel[]
  response_metadata?: { next_cursor?: string }
}

/**
 * List all public channels the bot has access to.
 * Paginates automatically through all results.
 */
export async function fetchSlackChannels(
  token: string
): Promise<SlackChannel[]> {
  const allChannels: SlackChannel[] = []
  let cursor: string | undefined
  let pages = 0
  const MAX_PAGES = 10 // Cap at ~2000 channels

  do {
    const params: Record<string, string> = {
      types: "public_channel",
      exclude_archived: "true",
      limit: "200",
    }
    if (cursor) params.cursor = cursor

    const data = await slackFetch<ChannelsResponse>(
      "conversations.list",
      token,
      params
    )

    allChannels.push(...data.channels)
    cursor = data.response_metadata?.next_cursor || undefined
    pages++
  } while (cursor && pages < MAX_PAGES)

  return allChannels
}

// ── Message types ──────────────────────────────────────────

export interface SlackMessage {
  type: string
  subtype?: string
  user?: string
  text: string
  ts: string
  reply_count?: number
  reply_users_count?: number
  thread_ts?: string
}

interface MessagesResponse extends SlackApiResponse {
  messages: SlackMessage[]
  has_more: boolean
  response_metadata?: { next_cursor?: string }
}

/**
 * Fetch messages from a channel since a given timestamp.
 * Paginates automatically with a cap on total messages per channel.
 * `oldest` is a Unix timestamp (seconds).
 */
export async function fetchSlackMessages(
  token: string,
  channelId: string,
  oldest: number,
  maxMessages = 2000
): Promise<SlackMessage[]> {
  const allMessages: SlackMessage[] = []
  let cursor: string | undefined

  do {
    const params: Record<string, string> = {
      channel: channelId,
      oldest: oldest.toString(),
      limit: "200",
    }
    if (cursor) params.cursor = cursor

    const data = await slackFetch<MessagesResponse>(
      "conversations.history",
      token,
      params
    )

    allMessages.push(...data.messages)
    cursor = data.response_metadata?.next_cursor || undefined

    // Stop if we've collected enough messages for this channel
    if (allMessages.length >= maxMessages) break
  } while (cursor)

  return allMessages
}

// ── User types ──────────────────────────────────────────

export interface SlackUser {
  id: string
  name: string
  real_name: string
  is_bot: boolean
  deleted: boolean
  profile: {
    email?: string
    display_name: string
    image_48: string
  }
}

interface UsersResponse extends SlackApiResponse {
  members: SlackUser[]
  response_metadata?: { next_cursor?: string }
}

/**
 * List all workspace users. Paginates automatically.
 */
export async function fetchSlackUsers(token: string): Promise<SlackUser[]> {
  const allUsers: SlackUser[] = []
  let cursor: string | undefined
  let pages = 0
  const MAX_PAGES = 10

  do {
    const params: Record<string, string> = { limit: "200" }
    if (cursor) params.cursor = cursor

    const data = await slackFetch<UsersResponse>("users.list", token, params)

    allUsers.push(...data.members)
    cursor = data.response_metadata?.next_cursor || undefined
    pages++
  } while (cursor && pages < MAX_PAGES)

  return allUsers
}

// ── Team types ──────────────────────────────────────────

export interface SlackTeamInfo {
  id: string
  name: string
  domain: string
  email_domain: string
  icon: { image_68: string; image_88: string; image_132: string }
}

interface TeamResponse extends SlackApiResponse {
  team: SlackTeamInfo
}

/**
 * Fetch workspace (team) information.
 */
export async function fetchSlackTeamInfo(
  token: string
): Promise<SlackTeamInfo> {
  const data = await slackFetch<TeamResponse>("team.info", token)
  return data.team
}
