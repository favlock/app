import { beforeEach, describe, expect, it } from "vitest";
import {
  DUPLICATE_SCAN_INTERVAL_MS,
  isDailyDuplicateScanDue,
  nextDuplicateScanAt,
  readDuplicateScanState,
  writeDuplicateScanState,
} from "./duplicateScanPreference";

describe("duplicate scan preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to daily tracking-aware scans", () => {
    expect(readDuplicateScanState("user-1")).toEqual({
      dailyScanEnabled: true,
      duplicateCount: 0,
      duplicateGroups: [],
      lastScanAt: null,
      lastScanMatchMode: null,
      matchMode: "tracking",
      nextScanAt: null,
      scanInProgress: false,
      scannedCount: 0,
      totalCount: 0,
    });
  });

  it("stores scan progress and duplicate identities per user", () => {
    writeDuplicateScanState("user-1", {
      dailyScanEnabled: false,
      duplicateCount: 2,
      duplicateGroups: [{ keeperId: "keep", duplicateIds: ["one", "two"] }],
      lastScanAt: "2026-09-05T12:00:00.000Z",
      lastScanMatchMode: "tracking",
      matchMode: "query",
      nextScanAt: "2026-09-06T12:00:00.000Z",
      scanInProgress: false,
      scannedCount: 400,
      totalCount: 400,
    });

    expect(readDuplicateScanState("user-1")).toEqual({
      dailyScanEnabled: false,
      duplicateCount: 2,
      duplicateGroups: [{ keeperId: "keep", duplicateIds: ["one", "two"] }],
      lastScanAt: "2026-09-05T12:00:00.000Z",
      lastScanMatchMode: "tracking",
      matchMode: "query",
      nextScanAt: "2026-09-06T12:00:00.000Z",
      scanInProgress: false,
      scannedCount: 400,
      totalCount: 400,
    });
    expect(readDuplicateScanState("user-2").matchMode).toBe("tracking");
  });

  it("schedules the next scan 24 hours after successful completion", () => {
    const now = Date.parse("2026-09-06T12:00:00.000Z");
    const state = {
      dailyScanEnabled: true,
      duplicateCount: 0,
      duplicateGroups: [],
      lastScanAt: new Date(now - DUPLICATE_SCAN_INTERVAL_MS).toISOString(),
      lastScanMatchMode: "tracking" as const,
      matchMode: "tracking" as const,
      nextScanAt: new Date(now).toISOString(),
      scanInProgress: false,
      scannedCount: 10,
      totalCount: 10,
    };

    expect(isDailyDuplicateScanDue(state, now)).toBe(true);
    expect(
      isDailyDuplicateScanDue(
        { ...state, nextScanAt: new Date(now + 1_000).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(nextDuplicateScanAt("2026-09-05T12:00:00.000Z")).toBe(
      "2026-09-06T12:00:00.000Z",
    );
    expect(
      isDailyDuplicateScanDue(
        {
          ...state,
          nextScanAt: new Date(now + 1_000).toISOString(),
          scanInProgress: true,
        },
        now,
      ),
    ).toBe(true);
  });
});
