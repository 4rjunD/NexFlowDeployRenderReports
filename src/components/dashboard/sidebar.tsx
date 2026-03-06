"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Zap,
  Users,
  FileText,
  ClipboardCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Clients", href: "/dashboard/admin/clients", icon: Users },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "Review Queue", href: "/dashboard/admin/review", icon: ClipboardCheck },
]

interface SidebarProps {
  userRole?: string
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Zap className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">NexFlow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
