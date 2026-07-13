import { getPeriodStarts } from "./cycles";
import { getPrimaryTemperature } from "./temperature";
import type { CycleEntry, CycleObservationStreak, CycleStats } from "../types";
import type { PhaseDay } from "./phases";
import type { StreakReward } from "./streakRewards";

export interface AiChatContext {
  today: string;
  role: "owner" | "member" | null;
  entries: CycleEntry[];
  stats: CycleStats;
  phaseByDate: Map<string, PhaseDay>;
  observationStreak: CycleObservationStreak;
  streakRewards: StreakReward[];
}

export interface AiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

const MAX_ENTRY_RANGE_DAYS = 60;

export const AI_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_cycle_summary",
      description: "Devuelve la fase actual del ciclo, el día de ciclo, la confianza de la estimación y promedios calculados (duración de ciclo, duración de periodo, próximo periodo estimado).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_entries",
      description: "Devuelve los registros diarios (periodo, flujo, temperaturas, moco cervical, cérvix) entre dos fechas. Máximo 60 días de rango.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Fecha inicial en formato YYYY-MM-DD" },
          to: { type: "string", description: "Fecha final en formato YYYY-MM-DD" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_temperature_stats",
      description: "Devuelve las lecturas de temperatura basal y estadísticas básicas (promedio, mínima, máxima, si hay transición térmica) del ciclo actual o del anterior.",
      parameters: {
        type: "object",
        properties: {
          cycle: { type: "string", enum: ["current", "previous"], description: "Qué ciclo consultar." },
        },
        required: ["cycle"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_streak_and_rewards",
      description: "Devuelve la racha de observación actual/más larga y el estado de las recompensas de racha (canjeadas y pendientes).",
      parameters: { type: "object", properties: {} },
    },
  },
];

export function executeAiTool(name: string, rawArgs: string, context: AiChatContext): unknown {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case "get_cycle_summary":
      return getCycleSummary(context);
    case "get_entries":
      return getEntries(context, String(args.from ?? ""), String(args.to ?? ""));
    case "get_temperature_stats":
      return getTemperatureStats(context, args.cycle === "previous" ? "previous" : "current");
    case "get_streak_and_rewards":
      return getStreakAndRewards(context);
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

function getCycleSummary(context: AiChatContext) {
  const todayPhase = context.phaseByDate.get(context.today);
  return {
    today: context.today,
    cycleDay: todayPhase?.cycleDay,
    phase: todayPhase?.phase,
    phaseLabel: todayPhase?.label,
    confidence: todayPhase?.confidence,
    description: todayPhase?.description,
    cycleCount: context.stats.cycleCount,
    averageCycleLength: context.stats.averageCycleLength,
    averagePeriodLength: context.stats.averagePeriodLength,
    lastPeriodStart: context.stats.lastPeriodStart,
    predictedNextPeriod: context.stats.predictedNextPeriod,
  };
}

function getEntries(context: AiChatContext, from: string, to: string) {
  if (!from || !to) return { error: "Se necesitan las fechas 'from' y 'to'." };
  const [start, end] = from <= to ? [from, to] : [to, from];
  const cappedStart = dayDiffCap(start, end) > MAX_ENTRY_RANGE_DAYS ? offsetDate(end, -MAX_ENTRY_RANGE_DAYS) : start;

  const includeNotes = context.role !== "member";
  const entries = context.entries
    .filter((entry) => entry.date >= cappedStart && entry.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      date: entry.date,
      isPeriod: entry.isPeriod,
      flow: entry.flow,
      temperatureReadings: entry.temperatureReadings.map((reading) => ({
        time: reading.time,
        value: reading.value,
        resting: reading.isResting,
        site: reading.site,
      })),
      cervicalMucus: entry.cervicalMucus,
      cervix: { height: entry.cervixHeight, firmness: entry.cervixFirmness, openness: entry.cervixOpenness },
      note: includeNotes ? entry.note || undefined : undefined,
    }));

  return { from: cappedStart, to: end, entries };
}

function getTemperatureStats(context: AiChatContext, cycle: "current" | "previous") {
  const sorted = [...context.entries].sort((a, b) => a.date.localeCompare(b.date));
  const starts = getPeriodStarts(sorted);
  if (starts.length === 0) return { cycle, readings: [], message: "Aún no hay periodos registrados." };

  const lastStart = starts.at(-1)!;
  const previousStart = starts.at(-2);

  let windowStart: string;
  let windowEnd: string | undefined;
  if (cycle === "current") {
    windowStart = lastStart;
    windowEnd = undefined;
  } else {
    if (!previousStart) return { cycle, readings: [], message: "Todavía no hay un ciclo anterior completo." };
    windowStart = previousStart;
    windowEnd = lastStart;
  }

  const windowEntries = sorted.filter((entry) => entry.date >= windowStart && (!windowEnd || entry.date < windowEnd));
  const readings = windowEntries
    .map((entry) => ({ date: entry.date, value: getPrimaryTemperature(entry)?.value }))
    .filter((reading): reading is { date: string; value: number } => typeof reading.value === "number");

  const values = readings.map((reading) => reading.value);
  const phases = windowEntries.map((entry) => context.phaseByDate.get(entry.date)?.phase);
  const hasThermalShift = phases.includes("thermal-shift") || phases.includes("luteal");

  return {
    cycle,
    from: windowStart,
    to: windowEnd,
    readings,
    average: values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : undefined,
    min: values.length ? Math.min(...values) : undefined,
    max: values.length ? Math.max(...values) : undefined,
    thermalShiftDetected: hasThermalShift,
  };
}

function getStreakAndRewards(context: AiChatContext) {
  return {
    observationStreak: context.observationStreak,
    rewards: context.streakRewards.map((reward) => ({
      title: reward.title,
      category: reward.category,
      thresholdDays: reward.thresholdDays,
      redeemed: Boolean(reward.redeemedAt),
      redeemedAt: reward.redeemedAt,
    })),
  };
}

function dayDiffCap(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
}

function offsetDate(date: string, days: number): string {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildSystemPrompt(context: AiChatContext): string {
  const todayPhase = context.phaseByDate.get(context.today);
  const roleLine =
    context.role === "member"
      ? "Hablas con la pareja (rol 'member'), no con la dueña de los datos. Enfócate en cómo puede apoyarla hoy, con empatía y sin acceso a notas personales textuales: la herramienta get_entries no te dará el contenido de sus notas."
      : context.role === "owner"
        ? "Hablas con la dueña de los datos (rol 'owner')."
        : "No hay una cuenta identificada; responde con generalidad.";

  return [
    "Eres Alba, una asistente cálida en español (trato de tú) dentro de una app privada de seguimiento de ciclo menstrual y temperatura basal.",
    "No diagnosticas, no confirmas ovulación con certeza, no das indicaciones anticonceptivas y no sustituyes atención médica. Hablas de patrones observacionales, con humildad cuando falten datos.",
    "Usa las herramientas disponibles (get_cycle_summary, get_entries, get_temperature_stats, get_streak_and_rewards) para fundamentar tus respuestas en datos reales antes de responder preguntas sobre el ciclo, las temperaturas o las rachas.",
    `Fecha de hoy: ${context.today}. Día de ciclo actual: ${todayPhase?.cycleDay ?? "desconocido"}. Fase actual: ${todayPhase?.label ?? "sin datos suficientes"}.`,
    roleLine,
    "Responde breve, cálida y en español natural: 2 a 4 frases como norma. Solo extiéndete si te piden explícitamente más detalle. Usa listas cortas solo cuando ayuden a la claridad.",
  ].join("\n");
}
