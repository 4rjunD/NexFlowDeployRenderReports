import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: { reportId: string } }
) {
  const report = await prisma.report.findUnique({
    where: { id: params.reportId },
    select: {
      id: true,
      status: true,
      title: true,
      summary: true,
      generatedAt: true,
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
