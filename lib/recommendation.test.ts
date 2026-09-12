import { beforeEach, describe, expect, it } from "vitest";
import { hashDeletionSecret } from "./crypto";
import { recommendWindows } from "./recommendation";
import { getPlanStore } from "./store";
import type { DayReading, ForecastBundle, HourReading, SavedPlan } from "./types";

function hours(overrides: Partial<HourReading> = {}): HourReading[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `2026-09-12T${String(hour).padStart(2, "0")}:00`,
    cloudCover: 35,
    directRadiation: hour >= 6 && hour <= 19 ? 250 : 0,
    diffuseRadiation: hour >= 6 && hour <= 19 ? 100 : 0,
    visibility: 10_000,
    precipitationProbability: 10,
    ...overrides
  }));
}

function day(readings = hours()): DayReading {
  return {
    date: "2026-09-12",
    sunrise: "2026-09-12T06:00",
    sunset: "2026-09-12T20:00",
    daylightDuration: 50_400,
    sunshineDuration: 32_400,
    hours: readings
  };
}

function forecast(): ForecastBundle {
  return {
    place: { id: 1, name: "Portland", region: "Oregon", country: "United States", latitude: 45.52, longitude: -122.68, timezone: "America/Los_Angeles" },
    timezoneAbbreviation: "PDT",
    utcOffsetSeconds: -25_200,
    retrievedAt: "2026-09-12T12:00:00.000Z",
    days: [day()],
    source: "Open-Meteo"
  };
}

function plan(id: string): SavedPlan {
  return {
    schemaVersion: 1,
    id,
    place: forecast().place,
    date: "2026-09-12",
    activity: "portraits",
    preference: "none",
    snapshot: forecast(),
    createdAt: "2026-09-12T12:00:00.000Z",
    sourceAttribution: "Forecast data by Open-Meteo, CC BY 4.0.",
    deletionHash: hashDeletionSecret("secret")
  };
}

describe("recommendWindows", () => {
  it("keeps every qualifying pair and exposes only approved tier words", () => {
    const windows = recommendWindows(day(), "portraits", "none");
    expect(windows).toHaveLength(13);
    expect(windows.every((window) => ["Strong fit", "Workable", "Limited"].includes(window.tier))).toBe(true);
    expect(windows[0].tier).toBe("Strong fit");
  });

  it("holds the result at Limited when a required value is unavailable", () => {
    const readings = hours({ visibility: null });
    const windows = recommendWindows(day(readings), "portraits", "none");
    expect(windows[0].tier).toBe("Limited");
    expect(windows[0].criteria.some((criterion) => criterion.status === "unavailable")).toBe(true);
    expect(windows[0].means.visibility).toBeNull();
  });

  it("returns no winner when two consecutive daylight hours do not exist", () => {
    const polar = { ...day(), sunrise: null, sunset: null, daylightDuration: 0 };
    expect(recommendWindows(polar, "daylight-walk", "none")).toEqual([]);
  });

  it("uses the selected time preference before rain and earlier time", () => {
    const windows = recommendWindows(day(), "portraits", "evening");
    expect(windows[0].start).toBe("2026-09-12T17:00");
  });
});

describe("memory plan store", () => {
  beforeEach(() => {
    process.env.USE_MEMORY_STORE = "1";
    globalThis.apertureMemoryStore = undefined;
  });

  it("returns the original result for an idempotency replay", async () => {
    const store = getPlanStore()!;
    const first = await store.create(plan("A".repeat(32)), "browser", "same-key");
    const replay = await store.create(plan("B".repeat(32)), "browser", "same-key");
    expect(first).toEqual({ ok: true, id: "A".repeat(32), replay: false });
    expect(replay).toEqual({ ok: true, id: "A".repeat(32), replay: true });
  });

  it("enforces the rolling per-browser cap atomically in the adapter", async () => {
    const store = getPlanStore()!;
    for (const letter of ["A", "B", "C"]) {
      expect((await store.create(plan(letter.repeat(32)), "one-browser", `key-${letter}`)).ok).toBe(true);
    }
    expect(await store.create(plan("D".repeat(32)), "one-browser", "key-D")).toEqual({ ok: false, reason: "browser-cap" });
  });

  it("requires the correct deletion hash and removes the record", async () => {
    const store = getPlanStore()!;
    await store.create(plan("Z".repeat(32)), "browser", "delete-key");
    expect(await store.delete("Z".repeat(32), hashDeletionSecret("wrong"))).toBe("unauthorized");
    expect(await store.delete("Z".repeat(32), hashDeletionSecret("secret"))).toBe("deleted");
    expect(await store.get("Z".repeat(32))).toBeNull();
  });
});
