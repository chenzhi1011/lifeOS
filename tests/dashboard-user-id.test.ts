import { describe, expect, it } from "vitest";
import { isSupabaseAuthUserId, normalizeDashboardUserId } from "@/src/dashboard/user-id";

describe("dashboard user id validation", () => {
  it("accepts Supabase Auth UUIDs and the local demo user", () => {
    expect(normalizeDashboardUserId("demo-user")).toBe("demo-user");
    expect(normalizeDashboardUserId("  7f9c4f5a-83b8-4e47-9c75-ef6fb20a7c2d  ")).toBe("7f9c4f5a-83b8-4e47-9c75-ef6fb20a7c2d");
  });

  it("rejects empty, long, and script-like values", () => {
    expect(normalizeDashboardUserId("")).toBeNull();
    expect(normalizeDashboardUserId("   ")).toBeNull();
    expect(normalizeDashboardUserId("<script>alert(1)</script>")).toBeNull();
    expect(normalizeDashboardUserId("a".repeat(65))).toBeNull();
  });

  it("distinguishes the local demo user from Supabase Auth UUIDs", () => {
    expect(isSupabaseAuthUserId("demo-user")).toBe(false);
    expect(isSupabaseAuthUserId("7f9c4f5a-83b8-4e47-9c75-ef6fb20a7c2d")).toBe(true);
  });
});
