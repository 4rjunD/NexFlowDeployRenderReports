import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

// GET /api/unsubscribe?token=xxx — public, no auth needed
// Shows a confirmation page and processes the unsubscribe
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const confirm = request.nextUrl.searchParams.get("confirm");

  if (!token) {
    return new NextResponse(unsubPage("Invalid Link", "This unsubscribe link is missing required parameters.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const recipient = await prisma.reportRecipient.findUnique({
    where: { unsubscribeToken: token },
    include: { organization: { select: { name: true } } },
  });

  if (!recipient) {
    return new NextResponse(unsubPage("Link Expired", "This unsubscribe link is no longer valid.", false), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (recipient.unsubscribedAt) {
    return new NextResponse(
      unsubPage("Already Unsubscribed", `You've already been unsubscribed from ${recipient.organization.name} reports.`, false),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // If confirm=1, process the unsubscribe
  if (confirm === "1") {
    await prisma.reportRecipient.update({
      where: { id: recipient.id },
      data: { unsubscribedAt: new Date(), active: false },
    });

    return new NextResponse(
      unsubPage("Unsubscribed", `You will no longer receive engineering reports from ${recipient.organization.name}. If this was a mistake, contact your admin.`, false),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Show confirmation page
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const confirmUrl = `${baseUrl}/api/unsubscribe?token=${token}&confirm=1`;

  return new NextResponse(
    unsubPage(
      "Unsubscribe from Reports",
      `You are about to unsubscribe <strong>${recipient.email}</strong> from ${recipient.organization.name} engineering reports.`,
      true,
      confirmUrl
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function unsubPage(title: string, message: string, showButton: boolean, confirmUrl?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NexFlow — ${title}</title>
<style>
  body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f9fafb;margin:0}
  .card{text-align:center;padding:48px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:420px}
  h1{font-size:20px;margin:0 0 12px;color:#111}
  p{font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.6}
  .brand{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:24px}
  .btn{display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600}
  .btn:hover{background:#b91c1c}
</style></head>
<body><div class="card">
  <div class="brand">NexFlow Engineering Intelligence</div>
  <h1>${title}</h1>
  <p>${message}</p>
  ${showButton && confirmUrl ? `<a href="${confirmUrl}" class="btn">Confirm Unsubscribe</a>` : ""}
</div></body></html>`;
}
