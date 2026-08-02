import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { completeGrowthGoal } from "@/src/actions/growth-completion";
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
    const result = await completeGrowthGoal(
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
        { error: "invalid goal completion" },
        { status: 400, headers: auth.rateHeaders }
      );
    }
    return NextResponse.json(
      { error: "failed to complete goal" },
      { status: 500, headers: auth.rateHeaders }
    );
  }
}
