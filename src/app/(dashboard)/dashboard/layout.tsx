import { auth } from "@/lib/auth"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="flex min-h-screen">
      <Sidebar userRole={(session?.user as any)?.role} />
      <div className="ml-60 flex flex-1 flex-col">
        <Header
          title="NexFlow Admin"
          userName={session?.user?.name}
          userImage={session?.user?.image}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
