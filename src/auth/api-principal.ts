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
  return match ? decodeURIComponent(match[1]!) : null;
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
