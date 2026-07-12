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
