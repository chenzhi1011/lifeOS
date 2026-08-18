import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateActionToken, extractBearerToken } from "@/src/actions/auth";
import { createServiceSupabaseClient } from "@/src/db/supabase";

export type ApiPrincipal = {
  userId: string;
  actorType: "session" | "action";
  actorName?: string;
};

function cookieToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)life_os_access_token=([^;]+)/);
  // todo check？
  if (match) return decodeURIComponent(match[1]!);
  const chunks = cookie.split(/;\s*/).map((item) => item.split(/=(.*)/s).slice(0, 2) as [string,string])
    .filter(([name]) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name))
    .sort(([left], [right]) => left.localeCompare(right));
  if (!chunks.length) return null;
  try {
    let value = decodeURIComponent(chunks.map(([, part]) => part).join(""));
    if (value.startsWith("base64-")) value = Buffer.from(value.slice(7), "base64url").toString("utf8");
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
    return typeof parsed?.access_token === "string" ? parsed.access_token : null;
  } catch { return null; }
}

export async function resolveSessionPrincipal(
  request: Request,
  client: Pick<SupabaseClient, "auth"> | null = createServiceSupabaseClient()
): Promise<ApiPrincipal | null> {
  const token = extractBearerToken(request) ?? cookieToken(request);
  if (!token || token.startsWith("los_") || !client) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return { userId: data.user.id, actorType: "session" };
}

export async function resolveApiPrincipal(request: Request): Promise<ApiPrincipal | null> {
  const token = extractBearerToken(request);
  if (token?.startsWith("los_")) {
    const credential = await authenticateActionToken(token);
    return credential ? { userId: credential.userId, actorType: "action", actorName: credential.name } : null;
  }
  return resolveSessionPrincipal(request);
}
