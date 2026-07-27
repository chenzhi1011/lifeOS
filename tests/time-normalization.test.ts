import { describe, expect, it } from "vitest";
import { normalizeTaskTime } from "@/src/actions/time-normalization";

const settings = {
  timezone: "Asia/Tokyo",
  defaultReminderTime: "09:00"
};

describe("normalizeTaskTime", () => {
  it("uses the user's default reminder time for a future local date", () => {
    expect(
      normalizeTaskTime(
        { localDate: "2026-07-28" },
        settings,
        new Date("2026-07-27T00:00:00.000Z")
      )
    ).toEqual({
      ok: true,
      dueAt: "2026-07-28T00:00:00.000Z",
      remindAt: "2026-07-28T00:00:00.000Z"
    });
  });

  it("moves today's default time to one hour after now when it has passed", () => {
    expect(
      normalizeTaskTime(
        { localDate: "2026-07-27" },
        settings,
        new Date("2026-07-27T01:00:00.000Z")
      )
    ).toEqual({
      ok: true,
      dueAt: "2026-07-27T02:00:00.000Z",
      remindAt: "2026-07-27T02:00:00.000Z"
    });
  });

  it("preserves an explicit future time as the canonical UTC instant", () => {
    expect(
      normalizeTaskTime(
        {
          localDate: "2026-07-28",
          explicitDueAt: "2026-07-28T15:00:00+09:00"
        },
        settings,
        new Date("2026-07-27T00:00:00.000Z")
      )
    ).toEqual({
      ok: true,
      dueAt: "2026-07-28T06:00:00.000Z",
      remindAt: "2026-07-28T06:00:00.000Z"
    });
  });

  it("rejects an explicit time that is not after now", () => {
    const result = normalizeTaskTime(
      {
        localDate: "2026-07-27",
        explicitDueAt: "2026-07-27T09:00:00+09:00"
      },
      settings,
      new Date("2026-07-27T01:00:00.000Z")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/past/i);
    }
  });

  it("throws for an empty explicit task time instead of treating it as absent", () => {
    expect(() =>
      normalizeTaskTime(
        {
          localDate: "2026-07-28",
          explicitDueAt: ""
        },
        settings,
        new Date("2026-07-27T00:00:00.000Z")
      )
    ).toThrow(/invalid explicit task time/i);
  });

  it("rejects an explicit time whose user-local date differs from localDate", () => {
    expect(
      normalizeTaskTime(
        {
          localDate: "2026-07-28",
          explicitDueAt: "2026-07-29T09:00:00+09:00"
        },
        settings,
        new Date("2026-07-27T00:00:00.000Z")
      )
    ).toEqual({
      ok: false,
      reason: "explicit task time does not match local date"
    });
  });

  it("throws a clear error for an invalid IANA timezone", () => {
    expect(() =>
      normalizeTaskTime(
        { localDate: "2026-07-28" },
        { timezone: "Not/AZone", defaultReminderTime: "09:00" },
        new Date("2026-07-27T00:00:00.000Z")
      )
    ).toThrow(/timezone/i);
  });
});
