import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), tasks: vi.fn(), reminders: vi.fn() }));
vi.mock("@/src/auth/api-principal", () => ({ resolveSessionPrincipal: mocks.resolve }));
vi.mock("@/src/application/task-queries", () => ({ queryTasks: mocks.tasks }));
vi.mock("@/src/application/reminder-queries", () => ({ queryReminders: mocks.reminders }));
import { GET as getTasks } from "@/app/api/tasks/route";
import { GET as getReminders } from "@/app/api/reminders/route";

beforeEach(() => { vi.clearAllMocks(); });
describe("session query routes", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.resolve.mockResolvedValue(null);
    expect((await getTasks(new Request("https://example.com/api/tasks?userId=attacker"))).status).toBe(401);
    expect((await getReminders(new Request("https://example.com/api/reminders"))).status).toBe(401);
  });
  it("passes only the verified principal to query services", async () => {
    const principal = { userId: "user-1", actorType: "session" };
    mocks.resolve.mockResolvedValue(principal);
    mocks.tasks.mockResolvedValue({ items: [], nextCursor: null });
    const response = await getTasks(new Request("https://example.com/api/tasks?userId=attacker&limit=10"));
    expect(response.status).toBe(200);
    expect(mocks.tasks).toHaveBeenCalledWith(principal, expect.objectContaining({ limit: 10 }));
  });
});
