import { beforeEach, describe, expect, it } from "vitest";
import {
  LINK_HEALTH_SCAN_INTERVAL_MS,
  isLinkHealthScanDue,
  nextLinkHealthScanAt,
  readLinkHealthState,
  writeLinkHealthState,
} from "./linkHealthPreference";

describe("link health preferences", () => {
  beforeEach(() => localStorage.clear());

  it("is opt-in and not due by default", () => {
    const state = readLinkHealthState("user-1");
    expect(state.automaticScanEnabled).toBe(false);
    expect(isLinkHealthScanDue(state)).toBe(false);
  });

  it("schedules an enabled check seven days after completion", () => {
    const completedAt = "2026-09-07T08:00:00.000Z";
    const nextScanAt = nextLinkHealthScanAt(completedAt);
    expect(Date.parse(nextScanAt) - Date.parse(completedAt)).toBe(
      LINK_HEALTH_SCAN_INTERVAL_MS,
    );
    writeLinkHealthState("user-1", {
      automaticScanEnabled: true,
      brokenCount: 2,
      lastScanAt: completedAt,
      nextScanAt,
      scanInProgress: false,
      scanPaused: false,
      scanStartedAt: null,
      scannedCount: 10,
      totalCount: 10,
    });
    expect(isLinkHealthScanDue(readLinkHealthState("user-1"), Date.parse(nextScanAt) - 1)).toBe(false);
    expect(isLinkHealthScanDue(readLinkHealthState("user-1"), Date.parse(nextScanAt))).toBe(true);
  });

  it("does not automatically resume a user-paused scan", () => {
    expect(isLinkHealthScanDue({
      automaticScanEnabled: true,
      brokenCount: 0,
      lastScanAt: null,
      nextScanAt: null,
      scanInProgress: false,
      scanPaused: true,
      scanStartedAt: "2026-09-07T08:00:00.000Z",
      scannedCount: 100,
      totalCount: 10_000,
    })).toBe(false);
  });
});
