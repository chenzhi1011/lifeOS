import { NextResponse } from "next/server";
import { normalizeDashboardUserId } from "@/src/dashboard/user-id";
import { readGoalDetail } from "@/src/db/lifeos-read";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const userId = normalizeDashboardUserId(url.searchParams.get("userId"));
  if (!userId) {
    return NextResponse.json({ error: "A valid userId query parameter is required." }, { status: 400 });
  }

  return NextResponse.json(await readGoalDetail(id, userId));
}
