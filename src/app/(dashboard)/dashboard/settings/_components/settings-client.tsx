"use client"

import React, { useState } from "react"
import { format } from "date-fns"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Link2,
  Users,
  Bell,
  User,
  Plus,
  Check,
  X,
  Clock,
  Github,
  MessageSquare,
  CalendarDays,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntegrationItem {
  id: string
  type: "GITHUB" | "JIRA" | "LINEAR" | "SLACK" | "GOOGLE_CALENDAR"
  status: "CONNECTED" | "DISCONNECTED" | "PENDING"
  updatedAt: string
}

interface DeliveryPref {
  id: string
  reportType: "WEEKLY_DIGEST" | "SPRINT_RISK" | "MONTHLY_HEALTH"
  channel: "EMAIL" | "SLACK" | "IN_APP"
  enabled: boolean
}

interface UserData {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
  organization: {
    id: string
    name: string
    slug: string
    plan: string
  } | null
  deliveryPreferences: DeliveryPref[]
}

interface MemberItem {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
  createdAt: string
}

interface SettingsClientProps {
  integrations: IntegrationItem[]
  user: UserData | null
  members: MemberItem[]
}

// ---------------------------------------------------------------------------
// Integration configs
// ---------------------------------------------------------------------------

const INTEGRATION_CONFIG: Record<
  IntegrationItem["type"],
  { name: string; description: string; icon: React.ReactNode }
> = {
  GITHUB: {
    name: "GitHub",
    description:
      "Connect your GitHub organization to sync PRs, commits, and code review data.",
    icon: <Github className="h-6 w-6" />,
  },
  JIRA: {
    name: "Jira",
    description:
      "Import sprints, tickets, and project data from Jira for risk analysis.",
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
        J
      </div>
    ),
  },
  LINEAR: {
    name: "Linear",
    description:
      "Sync issues, cycles, and project data from Linear for flow metrics.",
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded bg-violet-600 text-[10px] font-bold text-white">
        L
      </div>
    ),
  },
  SLACK: {
    name: "Slack",
    description:
      "Deliver reports and notifications directly to your Slack channels.",
    icon: <MessageSquare className="h-6 w-6" />,
  },
  GOOGLE_CALENDAR: {
    name: "Google Calendar",
    description:
      "Analyze meeting load and team availability for sustainability insights.",
    icon: <CalendarDays className="h-6 w-6" />,
  },
}

const ALL_INTEGRATION_TYPES: IntegrationItem["type"][] = [
  "GITHUB",
  "JIRA",
  "LINEAR",
  "SLACK",
  "GOOGLE_CALENDAR",
]

const REPORT_TYPES = [
  { key: "WEEKLY_DIGEST" as const, label: "Weekly Digest" },
  { key: "SPRINT_RISK" as const, label: "Sprint Risk" },
  { key: "MONTHLY_HEALTH" as const, label: "Monthly Health" },
]

const CHANNELS = [
  { key: "EMAIL" as const, label: "Email" },
  { key: "SLACK" as const, label: "Slack" },
  { key: "IN_APP" as const, label: "In-App" },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: "CONNECTED" | "DISCONNECTED" | "PENDING"
}) {
  const config = {
    CONNECTED: {
      label: "Connected",
      className:
        "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300",
      icon: <Check className="h-3 w-3" />,
    },
    DISCONNECTED: {
      label: "Disconnected",
      className:
        "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
      icon: <X className="h-3 w-3" />,
    },
    PENDING: {
      label: "Pending",
      className:
        "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300",
      icon: <Clock className="h-3 w-3" />,
    },
  }

  const c = config[status]

  return (
    <Badge className={cn("inline-flex items-center gap-1 text-xs", c.className)}>
      {c.icon}
      {c.label}
    </Badge>
  )
}

function RoleBadge({ role }: { role: string }) {
  const colorMap: Record<string, string> = {
    ADMIN:
      "bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300",
    MEMBER:
      "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300",
    VIEWER:
      "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  }

  return (
    <Badge className={cn("text-xs", colorMap[role] ?? colorMap.MEMBER)}>
      {role}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Connections Tab
// ---------------------------------------------------------------------------

function ConnectionsTab({
  integrations,
}: {
  integrations: IntegrationItem[]
}) {
  const integrationMap = new Map(integrations.map((i) => [i.type, i]))

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ALL_INTEGRATION_TYPES.map((type) => {
        const config = INTEGRATION_CONFIG[type]
        const integration = integrationMap.get(type)
        const status = integration?.status ?? "DISCONNECTED"
        const isConnected = status === "CONNECTED"

        return (
          <Card key={type} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground">{config.icon}</div>
                  <CardTitle className="text-base">{config.name}</CardTitle>
                </div>
                <StatusBadge status={status} />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
              <div className="space-y-3">
                {isConnected && integration && (
                  <p className="text-xs text-muted-foreground">
                    Last synced:{" "}
                    {format(
                      new Date(integration.updatedAt),
                      "MMM d, yyyy 'at' h:mm a"
                    )}
                  </p>
                )}
                <Button
                  variant={isConnected ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                >
                  {isConnected ? "Disconnect" : "Connect"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team Tab
// ---------------------------------------------------------------------------

function TeamTab({ members }: { members: MemberItem[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Team Members</h3>
          <p className="text-sm text-muted-foreground">
            {members.length} members in your organization
          </p>
        </div>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Invite Member
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {member.name
                          ? member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                          : "?"}
                      </div>
                      <span className="font-medium">
                        {member.name ?? "Unknown"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.email ?? "--"}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={member.role} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(member.createdAt), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notifications Tab
// ---------------------------------------------------------------------------

function NotificationsTab({
  deliveryPreferences,
}: {
  deliveryPreferences: DeliveryPref[]
}) {
  // Build a lookup map
  const prefMap = new Map<string, boolean>()
  deliveryPreferences.forEach((dp) => {
    prefMap.set(`${dp.reportType}:${dp.channel}`, dp.enabled)
  })

  const [prefs, setPrefs] = useState(prefMap)

  function togglePref(reportType: string, channel: string) {
    const key = `${reportType}:${channel}`
    setPrefs((prev) => {
      const next = new Map(prev)
      next.set(key, !next.get(key))
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Delivery Preferences</h3>
        <p className="text-sm text-muted-foreground">
          Choose how you want to receive each type of report
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report Type</TableHead>
                {CHANNELS.map((ch) => (
                  <TableHead key={ch.key} className="text-center">
                    {ch.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {REPORT_TYPES.map((rt) => (
                <TableRow key={rt.key}>
                  <TableCell className="font-medium">{rt.label}</TableCell>
                  {CHANNELS.map((ch) => {
                    const key = `${rt.key}:${ch.key}`
                    const checked = prefs.get(key) ?? true
                    return (
                      <TableCell key={ch.key} className="text-center">
                        <button
                          type="button"
                          onClick={() => togglePref(rt.key, ch.key)}
                          className={cn(
                            "inline-flex h-5 w-5 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30 bg-background"
                          )}
                          aria-label={`${rt.label} via ${ch.label}`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </button>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="sm">Save Preferences</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account Tab
// ---------------------------------------------------------------------------

function AccountTab({ user }: { user: UserData | null }) {
  if (!user) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Unable to load account information.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* User Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Information</CardTitle>
          <CardDescription>Your personal account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                defaultValue={user.name ?? ""}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                defaultValue={user.email ?? ""}
                placeholder="your@email.com"
                disabled
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <div>
              <RoleBadge role={user.role} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm">Update Profile</Button>
          </div>
        </CardContent>
      </Card>

      {/* Organization Info */}
      {user.organization && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization</CardTitle>
            <CardDescription>Your organization details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input defaultValue={user.organization.name} disabled />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input defaultValue={user.organization.slug} disabled />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <div>
                <Badge variant="outline" className="text-xs capitalize">
                  {user.organization.plan}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SettingsClient({
  integrations,
  user,
  members,
}: SettingsClientProps) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage integrations, team, notifications, and account settings
        </p>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections" className="gap-1.5">
            <Link2 className="h-4 w-4" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5">
            <User className="h-4 w-4" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-6">
          <ConnectionsTab integrations={integrations} />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamTab members={members} />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab
            deliveryPreferences={user?.deliveryPreferences ?? []}
          />
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <AccountTab user={user} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
