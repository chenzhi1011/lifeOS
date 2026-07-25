import { NextResponse } from "next/server";
import { requireActionCredential } from "@/src/actions/request";
import { readActionContext } from "@/src/actions/repository";

export async function GET(request: Request) {
  const auth = await requireActionCredential(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const context = await readActionContext(auth.credential.userId);
    return NextResponse.json(
      {
        user: {
          id: auth.credential.userId,
          actionCredential: auth.credential.name
        },
        ...context
      },
      { headers: auth.rateHeaders }
    );
  } catch {
    return NextResponse.json({ error: "failed to read action context" }, { status: 500, headers: auth.rateHeaders });
  }
}
