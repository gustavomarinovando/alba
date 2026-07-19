import { addDays, parseISO } from "date-fns";
import type { CycleEntry, CycleObservationStreak, CycleStats } from "../types";
import { dayDiff, isoDate } from "./date";
import { hasMeaningfulEntry } from "./temperature";

export function calculateStats(entries: CycleEntry[], today = isoDate(new Date())): CycleStats {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const periodStarts = getPeriodStarts(sorted);
  const periodLengths = periodStarts.map((start) => countPeriodLength(sorted, start));
  const cycleLengths = periodStarts
    .slice(1)
    .map((start, index) => dayDiff(periodStarts[index], start))
    .filter((length) => length >= 15 && length <= 60);

  const averageCycleLength = average(cycleLengths);
  const averagePeriodLength = average(periodLengths.filter((length) => length > 0));
  const lastPeriodStart = periodStarts.at(-1);
  const predictedNextPeriod =
    lastPeriodStart && averageCycleLength
      ? isoDate(addDays(parseISO(lastPeriodStart), Math.round(averageCycleLength)))
      : undefined;

  return {
    cycleCount: periodStarts.length,
    averageCycleLength,
    averagePeriodLength,
    lastPeriodStart,
    predictedNextPeriod,
    observationStreak: calculateObservationStreak(sorted, today),
  };
}

export function calculateObservationStreak(entries: CycleEntry[], today = isoDate(new Date())): CycleObservationStreak {
  const meaningfulDates = Array.from(
    new Set(
      entries
        .filter(hasMeaningfulEntry)
        .map((entry) => entry.date)
        .filter((date) => date <= today),
    ),
  ).sort();

  if (meaningfulDates.length === 0) {
    return { current: 0, longest: 0 };
  }

  let runStart = meaningfulDates[0];
  let runEnd = meaningfulDates[0];
  let runLength = 1;
  let longestStartDate = runStart;
  let longestEndDate = runEnd;
  let longest = runLength;

  for (const date of meaningfulDates.slice(1)) {
    if (dayDiff(runEnd, date) === 1) {
      runEnd = date;
      runLength += 1;
    } else {
      runStart = date;
      runEnd = date;
      runLength = 1;
    }

    if (runLength > longest) {
      longest = runLength;
      longestStartDate = runStart;
      longestEndDate = runEnd;
    }
  }

  const currentEndDate = runEnd;
  const isCurrentStillActive = dayDiff(currentEndDate, today) <= 1;

  return {
    current: isCurrentStillActive ? runLength : 0,
    longest,
    currentStartDate: isCurrentStillActive ? runStart : undefined,
    currentEndDate: isCurrentStillActive ? currentEndDate : undefined,
    longestStartDate,
    longestEndDate,
  };
}

export interface CurrencyBreakdown {
  observationDays: number;
  noteDays: number;
  streakMilestones: number;
  monthiversaries: number;
  total: number;
}

/** How many huellitas each earning source is worth — surfaced in the store UI's "cómo ganar" note. */
export const CURRENCY_RATE = {
  observationDay: 1,
  noteDay: 1,
  streakMilestone: 5,
  monthiversary: 15,
} as const;

/**
 * Total huellitas ever earned, derived from entries so there's no separate "award" event system to
 * keep in sync. Deliberately monotonic — every source only ever grows as more days pass, never
 * shrinks because a streak later broke — so spendable balance (this minus redeemed currency-priced
 * rewards elsewhere) behaves like a real wallet instead of silently losing value.
 *
 * Note: deleting a past day's entry does reduce what it derives from, same tradeoff already accepted
 * for the observation streak; not solved here either, low risk for a private couple's app.
 */
export function calculateCurrencyEarned(entries: CycleEntry[], today = isoDate(new Date())): CurrencyBreakdown {
  const meaningfulDates = Array.from(
    new Set(
      entries
        .filter(hasMeaningfulEntry)
        .map((entry) => entry.date)
        .filter((date) => date <= today),
    ),
  ).sort();

  const observationDays = meaningfulDates.length;

  const noteDays = new Set(
    entries.filter((entry) => entry.note.trim().length > 0 && entry.date <= today).map((entry) => entry.date),
  ).size;

  // Every 7-day block within any historical run of consecutive observed days, not just the
  // current run — a milestone already earned stays earned even after the streak breaks.
  let streakMilestones = 0;
  let runLength = 0;
  let previousDate: string | undefined;
  for (const date of meaningfulDates) {
    runLength = previousDate && dayDiff(previousDate, date) === 1 ? runLength + 1 : 1;
    if (runLength % 7 === 0) streakMilestones += 1;
    previousDate = date;
  }

  // One bonus for each monthiversary (day 6) that's occurred since the first entry.
  let monthiversaries = 0;
  if (meaningfulDates.length > 0) {
    const start = parseISO(meaningfulDates[0]);
    const end = parseISO(today);
    let cursor = new Date(start.getFullYear(), start.getMonth(), 6);
    if (cursor < start) cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 6);
    while (cursor <= end) {
      monthiversaries += 1;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 6);
    }
  }

  const total =
    observationDays * CURRENCY_RATE.observationDay +
    noteDays * CURRENCY_RATE.noteDay +
    streakMilestones * CURRENCY_RATE.streakMilestone +
    monthiversaries * CURRENCY_RATE.monthiversary;

  return { observationDays, noteDays, streakMilestones, monthiversaries, total };
}

export function getCurrentCycleEntries(entries: CycleEntry[]): CycleEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const starts = getPeriodStarts(sorted);
  const lastStart = starts.at(-1);
  return lastStart ? sorted.filter((entry) => entry.date >= lastStart) : sorted.slice(-45);
}

export function getRecentEntries(entries: CycleEntry[], count = 90): CycleEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-count);
}

export function getPeriodStarts(sortedEntries: CycleEntry[]): string[] {
  const starts: string[] = [];
  let previousPeriodDate: string | undefined;

  for (const entry of sortedEntries) {
    if (!entry.isPeriod) continue;
    const isNewPeriod = !previousPeriodDate || dayDiff(previousPeriodDate, entry.date) > 1;
    if (isNewPeriod) starts.push(entry.date);
    previousPeriodDate = entry.date;
  }

  return starts;
}

function countPeriodLength(entries: CycleEntry[], start: string): number {
  const entrySet = new Set(entries.filter((entry) => entry.isPeriod).map((entry) => entry.date));
  let count = 0;
  let cursor = parseISO(start);

  while (entrySet.has(isoDate(cursor))) {
    count += 1;
    cursor = addDays(cursor, 1);
  }

  return count;
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const result = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(result * 10) / 10;
}
