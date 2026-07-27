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

  it.each([
    ["an impossible calendar date", "2026-02-31", "09:00"],
    ["an out-of-range local time", "2026-07-28", "24:00"]
  ])("rejects %s", (_description, localDate, defaultReminderTime) => {
    expect(() =>
      normalizeTaskTime(
        { localDate },
        { ...settings, defaultReminderTime },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toThrow(/invalid local task time/i);
  });

  it("accepts a valid leap day", () => {
    expect(
      normalizeTaskTime(
        { localDate: "2028-02-29" },
        settings,
        new Date("2028-01-01T00:00:00.000Z")
      )
    ).toEqual({
      ok: true,
      dueAt: "2028-02-29T00:00:00.000Z",
      remindAt: "2028-02-29T00:00:00.000Z"
    });
  });

  it("rejects a local time skipped by New York's DST spring transition", () => {
    expect(() =>
      normalizeTaskTime(
        { localDate: "2026-03-08" },
        {
          timezone: "America/New_York",
          defaultReminderTime: "02:30"
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toThrow(/invalid local task time/i);
  });

  it("rejects a local time skipped by Lord Howe's half-hour DST transition", () => {
    expect(() =>
      normalizeTaskTime(
        { localDate: "2026-10-04" },
        {
          timezone: "Australia/Lord_Howe",
          defaultReminderTime: "02:15"
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toThrow(/invalid local task time/i);
  });

  it("chooses the earlier instant for a repeated fall-back local time", () => {
    expect(
      normalizeTaskTime(
        { localDate: "2026-11-01" },
        {
          timezone: "America/New_York",
          defaultReminderTime: "01:30"
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toEqual({
      ok: true,
      dueAt: "2026-11-01T05:30:00.000Z",
      remindAt: "2026-11-01T05:30:00.000Z"
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
