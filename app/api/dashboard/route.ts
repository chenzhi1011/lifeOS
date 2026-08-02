import { NextResponse } from "next/server";
import { normalizeDashboardUserId } from "@/src/dashboard/user-id";
import { readDashboardData } from "@/src/db/lifeos-read";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = normalizeDashboardUserId(url.searchParams.get("userId"));
  if (!userId) {
    return NextResponse.json({ error: "A valid userId query parameter is required." }, { status: 400 });
  }

  try {
    const asOf = new Date();
    return NextResponse.json(await readDashboardData(userId, asOf));
  } catch {
    return NextResponse.json(
      { error: "failed to read dashboard data" },
      { status: 500 }
    );
  }
}
