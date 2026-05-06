import { addDays, parseISO } from "date-fns";
import type { CycleEntry, CycleStats } from "../types";
import { dayDiff, isoDate } from "./date";

export function calculateStats(entries: CycleEntry[]): CycleStats {
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
