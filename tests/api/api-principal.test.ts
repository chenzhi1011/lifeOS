import { describe, expect, it, vi } from "vitest";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

describe("resolveSessionPrincipal", () => {
  it("derives ownership from a verified access token, never request input", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const principal = await resolveSessionPrincipal(new Request("https://example.com/api/tasks?userId=attacker", { headers: { authorization: "Bearer session-jwt" } }), { auth: { getUser } } as never);
    expect(principal).toEqual({ userId: "user-1", actorType: "session" });
    expect(getUser).toHaveBeenCalledWith("session-jwt");
  });

  it("accepts a standard Supabase session cookie", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-cookie" } }, error: null });
    const value = encodeURIComponent(JSON.stringify(["session-jwt", "refresh-token"]));
    const principal = await resolveSessionPrincipal(new Request("https://example.com/api/tasks", { headers: { cookie: `sb-project-auth-token=${value}` } }), { auth: { getUser } } as never);
    expect(principal?.userId).toBe("user-cookie");
    expect(getUser).toHaveBeenCalledWith("session-jwt");
  });
});
