import { NextResponse } from "next/server";
import { queryGoalDetail } from "@/src/application/dashboard-queries";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await queryGoalDetail(principal, id));
}
