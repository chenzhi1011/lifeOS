import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { completeGrowthTask } from "@/src/actions/growth-completion";
import { resolveApiPrincipal } from "@/src/auth/api-principal";
import { requireActionCredential } from "@/src/actions/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const actionAuth = await requireActionCredential(request);
  const sessionPrincipal = actionAuth.ok ? null : await resolveApiPrincipal(request);
  if (!actionAuth.ok && !sessionPrincipal) return actionAuth.response;
  const principal = actionAuth.ok
    ? { userId: actionAuth.credential.userId, actorType: "action" as const }
    : sessionPrincipal!;
  const responseHeaders = actionAuth.ok ? actionAuth.rateHeaders : undefined;

  try {
    const { id } = await params;
    const result = await completeGrowthTask(
      principal.userId,
      id,
      await request.json()
    );
    return NextResponse.json(
      { ok: true, ...result },
      { headers: responseHeaders }
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid task completion" },
        { status: 400, headers: responseHeaders }
      );
    }
    return NextResponse.json(
      { error: "failed to complete task" },
      { status: 500, headers: responseHeaders }
    );
  }
}
