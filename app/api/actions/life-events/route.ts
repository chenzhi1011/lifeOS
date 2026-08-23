import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BatchIdempotencyConflictError, BatchStorageUnavailableError } from "@/src/actions/batch-repository";
import { requireActionCredential } from "@/src/actions/request";
import { recordLifeEventBatch } from "@/src/application/life-event-service";

function jsonWithRateHeaders(
  body: unknown,
  status: number,
  rateHeaders: Record<string, string>
) {
  return NextResponse.json(body, { status, headers: rateHeaders });
}

export async function POST(request: Request) {
  const auth = await requireActionCredential(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const result = await recordLifeEventBatch(
      { userId: auth.credential.userId, actorType: "action", actorName: auth.credential.name },
      body
    );

    return jsonWithRateHeaders(
      { ok: true, ...result },
      200,
      auth.rateHeaders
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonWithRateHeaders(
        { error: "invalid life event batch", issues: [] },
        400,
        auth.rateHeaders
      );
    }

    if (error instanceof ZodError) {
      return jsonWithRateHeaders(
        {
          error: "invalid life event batch",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        400,
        auth.rateHeaders
      );
    }

    if (error instanceof BatchIdempotencyConflictError) {
      return jsonWithRateHeaders(
        {
          error: "idempotency key was already used with different content"
        },
        409,
        auth.rateHeaders
      );
    }

    if (error instanceof BatchStorageUnavailableError) {
      return jsonWithRateHeaders(
        { error: "batch storage is unavailable" },
        503,
        auth.rateHeaders
      );
    }

    return jsonWithRateHeaders(
      { error: "failed to record life event batch" },
      500,
      auth.rateHeaders
    );
  }
}
