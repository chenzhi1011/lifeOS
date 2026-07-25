import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@/src/db/supabase";

export type ActionCredential = {
  userId: string;
  name: string;
  tokenHash: string;
  status: "active" | "revoked";
};

type StaticCredentialInput = {
  userId: string;
  name: string;
  token?: string;
  tokenHash?: string;
  status?: "active" | "revoked";
};

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function hashActionToken(token: string): Promise<string> {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeEqualHash(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function staticCredentials(): Promise<ActionCredential[]> {
  const raw = process.env.ACTION_CREDENTIALS_JSON;
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as StaticCredentialInput[];
  return Promise.all(
    parsed.map(async (credential) => ({
      userId: credential.userId,
      name: credential.name,
      tokenHash: credential.tokenHash ?? (credential.token ? await hashActionToken(credential.token) : ""),
      status: credential.status ?? "active"
    }))
  );
}

async function authenticateStaticCredential(tokenHash: string): Promise<ActionCredential | null> {
  for (const credential of await staticCredentials()) {
    if (credential.status === "active" && safeEqualHash(credential.tokenHash, tokenHash)) {
      return credential;
    }
  }
  return null;
}

async function authenticateSupabaseCredential(tokenHash: string): Promise<ActionCredential | null> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("action_credentials")
    .select("user_id,name,token_hash,status")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  await supabase.from("action_credentials").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash);

  return {
    userId: data.user_id,
    name: data.name,
    tokenHash: data.token_hash,
    status: data.status
  };
}

export async function authenticateActionToken(token: string): Promise<ActionCredential | null> {
  if (!/^los_[A-Za-z0-9._-]{16,}$/.test(token)) {
    return null;
  }

  const tokenHash = await hashActionToken(token);
  return (await authenticateStaticCredential(tokenHash)) ?? (await authenticateSupabaseCredential(tokenHash));
}
