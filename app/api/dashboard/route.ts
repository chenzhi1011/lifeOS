import { NextResponse } from "next/server";
import { queryDashboard } from "@/src/application/dashboard-queries";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function GET(request: Request) {
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const asOf = new Date();
    return NextResponse.json(await queryDashboard(principal, asOf));
  } catch {
    return NextResponse.json(
      { error: "failed to read dashboard data" },
      { status: 500 }
    );
  }
}
