import { NextResponse } from "next/server";
import { queryReminders } from "@/src/application/reminder-queries";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function GET(request: Request) {
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    return NextResponse.json(await queryReminders(principal, { status: url.searchParams.get("status") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 50) }));
  } catch { return NextResponse.json({ error: "failed to read reminders" }, { status: 500 }); }
}
