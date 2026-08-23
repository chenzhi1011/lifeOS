import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BatchIdempotencyConflictError, BatchStorageUnavailableError } from "@/src/actions/batch-repository";
import { recordLifeEventBatch } from "@/src/application/life-event-service";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

export async function POST(request: Request) {
  const principal = await resolveSessionPrincipal(request);
  if (!principal) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...await recordLifeEventBatch(principal, await request.json()) });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return NextResponse.json({ error: "invalid life event batch" }, { status: 400 });
    if (error instanceof BatchIdempotencyConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof BatchStorageUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "failed to record life event batch" }, { status: 500 });
  }
}
