import { NextResponse } from "next/server";
import { queryTasks } from "@/src/application/task-queries";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function GET(request: Request) {
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    return NextResponse.json(await queryTasks(principal, { status: url.searchParams.get("status") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 50) }));
  } catch { return NextResponse.json({ error: "failed to read tasks" }, { status: 500 }); }
}
