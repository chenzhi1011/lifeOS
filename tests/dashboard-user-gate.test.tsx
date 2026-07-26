import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/dashboard/page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("dashboard user gate", () => {
  it("renders typed user IDs in black", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    const userIdInput = screen.getByLabelText("User ID");
    expect(userIdInput.classList.contains("text-black")).toBe(true);
    expect(userIdInput.classList.contains("text-white")).toBe(false);
  });
});
