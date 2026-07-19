import { expect, test } from "vitest";
import type { CycleEntry } from "../types";
import { CURRENCY_RATE, calculateCurrencyEarned, calculateObservationStreak, calculateStats } from "./cycles";

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

test("counts observation days, note days, and totals huellitas earned", () => {
  const earned = calculateCurrencyEarned(
    [
      entry("2026-07-01", { note: "cramps" }),
      entry("2026-07-02", { cervicalMucus: "creamy" }),
      entry("2026-07-03", { isPeriod: true, flow: "light" }),
    ],
    "2026-07-03",
  );

  expect(earned.observationDays).toBe(3);
  expect(earned.noteDays).toBe(1);
  expect(earned.streakMilestones).toBe(0);
  expect(earned.monthiversaries).toBe(0);
  expect(earned.total).toBe(3 * CURRENCY_RATE.observationDay + 1 * CURRENCY_RATE.noteDay);
});

test("awards a streak milestone for every 7 consecutive observed days", () => {
  const days = Array.from({ length: 8 }, (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`);
  const earned = calculateCurrencyEarned(
    days.map((date) => entry(date, { note: "log" })),
    "2026-07-08",
  );

  expect(earned.streakMilestones).toBe(1);
});

test("keeps an earned streak milestone even after the streak later breaks", () => {
  const entries = [
    ...Array.from({ length: 7 }, (_, index) => entry(`2026-07-${String(index + 1).padStart(2, "0")}`, { note: "log" })),
    entry("2026-07-10", { note: "log after a gap" }),
  ];

  const earned = calculateCurrencyEarned(entries, "2026-07-10");

  expect(earned.streakMilestones).toBe(1);
});

test("counts one monthiversary per elapsed day-6 since the first entry", () => {
  const earned = calculateCurrencyEarned(
    [entry("2026-05-10", { note: "start" }), entry("2026-07-10", { note: "later" })],
    "2026-07-10",
  );

  // Day 6 crossed for June and July, not May (first entry is after May's day 6).
  expect(earned.monthiversaries).toBe(2);
});

test("ignores future-dated entries when computing currency earned", () => {
  const earned = calculateCurrencyEarned(
    [entry("2026-07-01", { note: "today" }), entry("2026-07-05", { note: "future" })],
    "2026-07-01",
  );

  expect(earned.observationDays).toBe(1);
  expect(earned.noteDays).toBe(1);
});
