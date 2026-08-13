import { describe, expect, it, vi } from "vitest";
import { resolveSessionPrincipal } from "@/src/auth/api-principal";

describe("resolveSessionPrincipal", () => {
  it("derives ownership from a verified access token, never request input", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const principal = await resolveSessionPrincipal(new Request("https://example.com/api/tasks?userId=attacker", { headers: { authorization: "Bearer session-jwt" } }), { auth: { getUser } } as never);
    expect(principal).toEqual({ userId: "user-1", actorType: "session" });
    expect(getUser).toHaveBeenCalledWith("session-jwt");
  });
});
