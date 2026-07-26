const LOCAL_DEMO_USER_ID = "demo-user";
const SUPABASE_AUTH_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupabaseAuthUserId(value: string): boolean {
  return SUPABASE_AUTH_UUID_PATTERN.test(value);
}

export function normalizeDashboardUserId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === LOCAL_DEMO_USER_ID) {
    return trimmed;
  }

  if (trimmed.length > 64) {
    return null;
  }

  return isSupabaseAuthUserId(trimmed) ? trimmed : null;
}
