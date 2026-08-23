import { render, screen } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import { GrowthTreeDashboard } from "@/src/components/GrowthTreeDashboard";
import type { DashboardData } from "@/src/domain/aggregation";
import type { GrowthTreeViewModel } from "@/src/domain/tree-visualization";
import type { Achievement } from "@/src/domain/types";

const { readDashboardDataMock } = vi.hoisted(() => ({
  readDashboardDataMock: vi.fn()
}));

vi.mock("@/src/db/lifeos-read", () => ({
  readDashboardData: readDashboardDataMock
}));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/src/auth/api-principal", () => ({ resolveSessionPrincipal: vi.fn().mockResolvedValue(null) }));

(globalThis as typeof globalThis & { React: typeof React }).React = React;

beforeEach(() => {
  readDashboardDataMock.mockReset();
});

describe("dashboard user gate", () => {
  it("renders typed user IDs in black", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    const userIdInput = screen.getByLabelText("User ID");
    expect(userIdInput.classList.contains("text-black")).toBe(true);
    expect(userIdInput.classList.contains("text-white")).toBe(false);
  });

  it("projects database rows on the server before rendering the client dashboard", async () => {
    const data: DashboardData = {
      goals: [],
      goalStats: [],
      allActivities: [],
      recentActivities: [],
      recentCompletedOneOffTasks: [],
      achievements: [],
      heatmap: [],
      inboxCount: 0
    };
    readDashboardDataMock.mockResolvedValue(data);

    const result = (await DashboardPage({
      searchParams: Promise.resolve({ userId: "demo-user" })
    })) as React.ReactElement<{
      viewModel: GrowthTreeViewModel;
      achievements: Achievement[];
    }>;

    expect(result.type).toBe(GrowthTreeDashboard);
    expect(result.props.viewModel.root.label).toBe("人生");
    expect(result.props.achievements).toBe(data.achievements);
    expect(readDashboardDataMock).toHaveBeenCalledWith("demo-user", expect.any(Date));
  });
});
