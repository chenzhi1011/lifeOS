import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { completeGrowthTask } from "@/src/actions/growth-completion";
import { requireActionCredential } from "@/src/actions/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireActionCredential(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const result = await completeGrowthTask(
      auth.credential.userId,
      id,
      await request.json()
    );
    return NextResponse.json(
      { ok: true, ...result },
      { headers: auth.rateHeaders }
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid task completion" },
        { status: 400, headers: auth.rateHeaders }
      );
    }
    return NextResponse.json(
      { error: "failed to complete task" },
      { status: 500, headers: auth.rateHeaders }
    );
  }
}
