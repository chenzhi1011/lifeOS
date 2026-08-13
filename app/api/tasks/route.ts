import { NextResponse } from "next/server";
import { queryTasks } from "@/src/application/task-queries";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function GET(request: Request) {
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    if (status && !["open","completed","cancelled"].includes(status)) return NextResponse.json({ error: "invalid task filters" }, { status: 400 });
    if (priority && !["low","normal","high"].includes(priority)) return NextResponse.json({ error: "invalid task filters" }, { status: 400 });
    return NextResponse.json(await queryTasks(principal, {
      status: status as "open"|"completed"|"cancelled"|undefined,
      priority: priority as "low"|"normal"|"high"|undefined,
      goalId: url.searchParams.get("goalId") ?? undefined,
      dueBefore: url.searchParams.get("dueBefore") ?? undefined,
      dueAfter: url.searchParams.get("dueAfter") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50)
    }));
  } catch { return NextResponse.json({ error: "failed to read tasks" }, { status: 500 }); }
}
