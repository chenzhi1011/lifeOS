import { NextResponse } from "next/server";
import { authenticateActionToken, extractBearerToken, hashActionToken, type ActionCredential } from "./auth";
import { checkActionRateLimit } from "./rate-limit";

export type ActionAuthResult =
  | { ok: true; credential: ActionCredential; tokenHash: string; rateHeaders: Record<string, string> }
  | { ok: false; response: NextResponse };

export async function requireActionCredential(request: Request): Promise<ActionAuthResult> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const preAuthRate = checkActionRateLimit("pre-auth", ip, 60, 60_000);
  const preAuthRateHeaders = {
    "x-ratelimit-remaining": String(preAuthRate.remaining),
    "x-ratelimit-reset": String(preAuthRate.resetAt)
  };

  if (!preAuthRate.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate limit exceeded" },
        { status: 429, headers: preAuthRateHeaders }
      )
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "missing bearer token" }, { status: 401 }) };
  }

  const credential = await authenticateActionToken(token);
  if (!credential) {
    return { ok: false, response: NextResponse.json({ error: "invalid action credential" }, { status: 401 }) };
  }

  const tokenHash = await hashActionToken(token);
  const rate = checkActionRateLimit(tokenHash, ip);
  const rateHeaders = {
    "x-ratelimit-remaining": String(rate.remaining),
    "x-ratelimit-reset": String(rate.resetAt)
  };

  if (!rate.allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: rateHeaders })
    };
  }

  return { ok: true, credential, tokenHash, rateHeaders };
}
