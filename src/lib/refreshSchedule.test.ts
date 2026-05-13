import { describe, expect, it } from "vitest";
import { formatRefreshCountdown, getLastPlannedRefreshTime, getNextRefreshTime } from "./refreshSchedule";

describe("refresh schedule", () => {
  it("returns the same-day 8:00 PM New York refresh during EDT", () => {
    const nextRefresh = getNextRefreshTime(new Date("2026-07-10T21:30:00.000Z"));

    expect(nextRefresh.toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  it("rolls to the next 8:00 PM New York refresh after the EDT cutoff", () => {
    const nextRefresh = getNextRefreshTime(new Date("2026-07-11T00:01:00.000Z"));

    expect(nextRefresh.toISOString()).toBe("2026-07-12T00:00:00.000Z");
  });

  it("returns the same-day 8:00 PM New York refresh during EST", () => {
    const nextRefresh = getNextRefreshTime(new Date("2026-01-10T22:15:00.000Z"));

    expect(nextRefresh.toISOString()).toBe("2026-01-11T01:00:00.000Z");
  });

  it("formats countdown labels from the next refresh target", () => {
    expect(formatRefreshCountdown(new Date("2026-01-10T22:15:00.000Z"))).toBe("2h 45m");
    expect(formatRefreshCountdown(new Date("2026-01-11T00:59:30.000Z"))).toBe("1m");
    expect(formatRefreshCountdown(new Date("2026-01-11T01:00:00.000Z"))).toBe("24h 0m");
  });

  it("returns the prior planned 8:00 PM New York refresh before the EDT cutoff", () => {
    const lastRefresh = getLastPlannedRefreshTime(new Date("2026-07-10T23:30:00.000Z"));

    expect(lastRefresh.toISOString()).toBe("2026-07-10T00:00:00.000Z");
  });

  it("returns the same-day planned 8:00 PM New York refresh after the EST cutoff", () => {
    const lastRefresh = getLastPlannedRefreshTime(new Date("2026-01-11T01:15:00.000Z"));

    expect(lastRefresh.toISOString()).toBe("2026-01-11T01:00:00.000Z");
  });
});
