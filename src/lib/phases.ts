import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { CycleEntry } from "../types";
import { getPeriodStarts } from "./cycles";
import { isoDate } from "./date";
import { getPrimaryTemperature } from "./temperature";

export type CyclePhase = "period" | "follicular" | "fertile" | "possible-ovulation" | "thermal-shift" | "luteal" | "expected-period";
export type PhaseConfidence = "alta" | "media" | "baja";

export interface PhaseDay {
  date: string;
  cycleDay?: number;
  phase: CyclePhase;
  label: string;
  confidence: PhaseConfidence;
  description: string;
}

export const phaseMeta: Record<CyclePhase, { label: string; color: string; soft: string }> = {
  period: { label: "Periodo", color: "#d89b8b", soft: "rgba(216,155,139,0.24)" },
  follicular: { label: "Folicular", color: "#8fb9ad", soft: "rgba(143,185,173,0.18)" },
  fertile: { label: "Ventana fértil estimada", color: "#d7c783", soft: "rgba(215,199,131,0.2)" },
  "possible-ovulation": { label: "Posible ovulación", color: "#f0dca2", soft: "rgba(240,220,162,0.24)" },
  "thermal-shift": { label: "Transición térmica", color: "#aeb7dc", soft: "rgba(174,183,220,0.22)" },
  luteal: { label: "Lútea", color: "#9fb7d8", soft: "rgba(159,183,216,0.18)" },
  "expected-period": { label: "Periodo estimado", color: "#c9a0b5", soft: "rgba(201,160,181,0.2)" },
};

export function buildPhaseMap(entries: CycleEntry[]): Map<string, PhaseDay> {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const starts = getPeriodStarts(sorted);
  const byDate = new Map(sorted.map((entry) => [entry.date, entry]));
  const phaseMap = new Map<string, PhaseDay>();

  if (sorted.length === 0) return phaseMap;

  const first = parseISO(sorted[0].date);
  const todayPlusBuffer = addDays(new Date(), 14);
  const lastEntryPlusBuffer = addDays(parseISO(sorted.at(-1)!.date), 14);
  const last = lastEntryPlusBuffer > todayPlusBuffer ? lastEntryPlusBuffer : todayPlusBuffer;

  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    const date = isoDate(cursor);
    const entry = byDate.get(date);
    const lastStart = [...starts].reverse().find((start) => start <= date);
    const nextStart = starts.find((start) => start > date);
    const cycleDay = lastStart ? differenceInCalendarDays(cursor, parseISO(lastStart)) + 1 : undefined;
    const tempShiftDay = lastStart ? detectThermalShiftDay(sorted, lastStart, nextStart) : undefined;
    const averageCycleLength = averageCycleLengthFromStarts(starts) ?? 30;
    const estimatedOvulationDay = Math.max(12, Math.round(averageCycleLength) - 14);
    const fertileStart = Math.max(6, estimatedOvulationDay - 5);
    const fertileEnd = estimatedOvulationDay + 1;
    const lutealStart = estimatedOvulationDay + 2;
    const expectedPeriodStart = lastStart ? isoDate(addDays(parseISO(lastStart), Math.round(averageCycleLength))) : undefined;

    let phase: CyclePhase = "follicular";
    let confidence: PhaseConfidence = "baja";

    if (entry?.isPeriod) {
      phase = "period";
      confidence = "alta";
    } else if (expectedPeriodStart && date >= expectedPeriodStart && !nextStart) {
      phase = "expected-period";
      confidence = "media";
    } else if (tempShiftDay && cycleDay && cycleDay >= tempShiftDay + 1) {
      phase = "luteal";
      confidence = "media";
    } else if (tempShiftDay && cycleDay && cycleDay === tempShiftDay - 1) {
      phase = "possible-ovulation";
      confidence = "media";
    } else if (tempShiftDay && cycleDay && cycleDay >= tempShiftDay && cycleDay <= tempShiftDay + 1) {
      phase = "thermal-shift";
      confidence = "media";
    } else if (cycleDay && cycleDay === estimatedOvulationDay) {
      phase = "possible-ovulation";
      confidence = entry?.cervicalMucus === "eggwhite" ? "media" : "baja";
    } else if (cycleDay && cycleDay >= fertileStart && cycleDay <= fertileEnd) {
      phase = "fertile";
      confidence = entry?.cervicalMucus === "watery" || entry?.cervicalMucus === "eggwhite" ? "media" : "baja";
    } else if (cycleDay && cycleDay >= lutealStart) {
      phase = "luteal";
      confidence = tempShiftDay ? "media" : "baja";
    }

    const meta = phaseMeta[phase];
    phaseMap.set(date, {
      date,
      cycleDay,
      phase,
      label: meta.label,
      confidence,
      description: describePhase(phase, confidence),
    });
  }

  return phaseMap;
}

export function currentPhase(entries: CycleEntry[], date: string): PhaseDay | undefined {
  return buildPhaseMap(entries).get(date);
}

function detectThermalShiftDay(sorted: CycleEntry[], start: string, nextStart?: string): number | undefined {
  const cycle = sorted.filter((entry) => entry.date >= start && (!nextStart || entry.date < nextStart));
  const temps = cycle.map((entry, index) => ({ day: index + 1, temp: getPrimaryTemperature(entry)?.value }));

  for (let index = 6; index < temps.length - 2; index += 1) {
    const previous = temps.slice(index - 6, index).map((item) => item.temp);
    const current = temps.slice(index, index + 3).map((item) => item.temp);
    if (previous.some((temp) => temp === undefined) || current.some((temp) => temp === undefined)) continue;

    const baseline = Math.max(...(previous as number[]));
    if ((current as number[]).every((temp) => temp >= baseline + 0.12)) {
      return temps[index].day;
    }
  }

  return undefined;
}

function averageCycleLengthFromStarts(starts: string[]): number | undefined {
  if (starts.length < 2) return undefined;
  const lengths = starts.slice(1).map((start, index) => differenceInCalendarDays(parseISO(start), parseISO(starts[index])));
  return Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length);
}

function describePhase(phase: CyclePhase, confidence: PhaseConfidence): string {
  const suffix = `Confianza ${confidence}.`;
  if (phase === "period") return `Día marcado con periodo. ${suffix}`;
  if (phase === "fertile") return `Ventana fértil estimada por calendario y observaciones disponibles. ${suffix}`;
  if (phase === "possible-ovulation") return `Día donde podría concentrarse la ovulación, segun calendario y/o cambio térmico. No es confirmación. ${suffix}`;
  if (phase === "thermal-shift") return `Posible transición térmica; conviene observar si la temperatura se sostiene. ${suffix}`;
  if (phase === "luteal") return `Temperaturas o dia del ciclo sugieren fase lútea. ${suffix}`;
  if (phase === "expected-period") return `Rango donde podría iniciar el siguiente periodo. ${suffix}`;
  return `Días previos a la ventana fértil estimada. ${suffix}`;
}
