import { NextResponse } from "next/server";
import { queryReminders } from "@/src/application/reminder-queries";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function GET(request: Request) {
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const status = url.searchParams.get("status");
    if (status && !["scheduled","sent","cancelled"].includes(status)) return NextResponse.json({ error: "invalid reminder filters" }, { status: 400 });
    return NextResponse.json(await queryReminders(principal, {
      status: status as "scheduled"|"sent"|"cancelled"|undefined,
      taskId: url.searchParams.get("taskId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50)
    }));
  } catch { return NextResponse.json({ error: "failed to read reminders" }, { status: 500 }); }
}
