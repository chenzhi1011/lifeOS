import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireActionCredential } from "@/src/actions/request";
import { validateLifeEventPayload } from "@/src/actions/validation";
import { writeLifeEventFromAction } from "@/src/actions/repository";

export async function POST(request: Request) {
  const auth = await requireActionCredential(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const payload = validateLifeEventPayload(body);
    const write = await writeLifeEventFromAction(auth.credential.userId, payload);

    return NextResponse.json(
      {
        ok: true,
        userId: auth.credential.userId,
        mode: write.mode,
        result: write.result
      },
      { headers: auth.rateHeaders }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "invalid life event payload",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        },
        { status: 400, headers: auth.rateHeaders }
      );
    }

    return NextResponse.json({ error: "failed to record life event" }, { status: 500, headers: auth.rateHeaders });
  }
}
