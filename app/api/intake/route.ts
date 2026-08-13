import { NextResponse } from "next/server";
import { getAIProvider } from "@/src/ai/providers";
import { lifeOSStore } from "@/src/domain/store";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await request.json();
  const text = String(body.text ?? "").trim();
  const userId = String(body.userId ?? "demo-user");
  const source = body.source === "mock" ? "mock" : "mock";

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const parsed = await getAIProvider().parseLifeEvent({ userId, text, source, timestamp });
  const writeResult = lifeOSStore.applyParseResult(userId, source, text, parsed);

  return NextResponse.json({ parsed, writeResult });
}
