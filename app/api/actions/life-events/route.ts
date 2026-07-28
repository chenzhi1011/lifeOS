import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  BatchIdempotencyConflictError,
  BatchStorageUnavailableError,
  writePreparedBatch
} from "@/src/actions/batch-repository";
import { prepareLifeEventBatch } from "@/src/actions/batch-preparation";
import { validateLifeEventBatchPayload } from "@/src/actions/batch-validation";
import { readActionContext } from "@/src/actions/repository";
import { requireActionCredential } from "@/src/actions/request";

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
    const payload = validateLifeEventBatchPayload(body);
    const context = await readActionContext(auth.credential.userId);
    const prepared = await prepareLifeEventBatch(
      payload,
      context,
      new Date()
    );
    const result = await writePreparedBatch(
      auth.credential.userId,
      prepared
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
