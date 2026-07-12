import { expect, test } from "vitest";
import type { CycleEntry } from "../types";
import { calculateObservationStreak, calculateStats } from "./cycles";

function entry(date: string, overrides: Partial<CycleEntry> = {}): CycleEntry {
  return {
    date,
    isPeriod: false,
    flow: "none",
    temperatureReadings: [],
    questionableTemp: false,
    note: "",
    createdAt: `${date}T07:00:00.000Z`,
    updatedAt: `${date}T07:00:00.000Z`,
    ...overrides,
  };
}

test("calculates current and longest meaningful observation streaks", () => {
  const streak = calculateObservationStreak(
    [
      entry("2026-07-01", { note: "cramps" }),
      entry("2026-07-02", { cervicalMucus: "creamy" }),
      entry("2026-07-04", { isPeriod: true, flow: "light" }),
      entry("2026-07-05", {
        temperatureReadings: [{ id: "t1", time: "07:10", value: 36.7, isResting: true, site: "oral", note: "" }],
      }),
      entry("2026-07-06", { note: "slept well" }),
    ],
    "2026-07-06",
  );

  expect(streak).toEqual({
    current: 3,
    longest: 3,
    currentStartDate: "2026-07-04",
    currentEndDate: "2026-07-06",
    longestStartDate: "2026-07-04",
    longestEndDate: "2026-07-06",
  });
});

test("keeps yesterday's current streak active so today can maintain it", () => {
  const streak = calculateObservationStreak(
    [
      entry("2026-07-08", { note: "energy" }),
      entry("2026-07-09", { isPeriod: true, flow: "medium" }),
      entry("2026-07-10", { cervicalMucus: "sticky" }),
    ],
    "2026-07-11",
  );

  expect(streak.current).toBe(3);
  expect(streak.currentEndDate).toBe("2026-07-10");
  expect(streak.longest).toBe(3);
});

test("resets current streak after more than one missed day but preserves longest", () => {
  const streak = calculateObservationStreak(
    [
      entry("2026-07-01", { note: "one" }),
      entry("2026-07-02", { note: "two" }),
      entry("2026-07-03", { note: "three" }),
    ],
    "2026-07-05",
  );

  expect(streak.current).toBe(0);
  expect(streak.currentStartDate).toBeUndefined();
  expect(streak.longest).toBe(3);
  expect(streak.longestStartDate).toBe("2026-07-01");
  expect(streak.longestEndDate).toBe("2026-07-03");
});

test("ignores empty entries, duplicate dates, and future observations", () => {
  const streak = calculateObservationStreak(
    [
      entry("2026-07-09"),
      entry("2026-07-10", { note: "first" }),
      entry("2026-07-10", { cervicalMucus: "watery" }),
      entry("2026-07-11"),
      entry("2026-07-12", { note: "future" }),
    ],
    "2026-07-11",
  );

  expect(streak.current).toBe(1);
  expect(streak.longest).toBe(1);
  expect(streak.currentStartDate).toBe("2026-07-10");
  expect(streak.currentEndDate).toBe("2026-07-10");
});

test("includes observation streaks in cycle stats", () => {
  const stats = calculateStats(
    [
      entry("2026-07-01", { isPeriod: true, flow: "medium" }),
      entry("2026-07-02", { note: "tired" }),
    ],
    "2026-07-02",
  );

  expect(stats.observationStreak.current).toBe(2);
  expect(stats.observationStreak.longest).toBe(2);
});
