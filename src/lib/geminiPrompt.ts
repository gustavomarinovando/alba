import type { CycleEntry, CycleStats } from "../types";

export interface GeminiInsightPayload {
  entries: CycleEntry[];
  stats: CycleStats;
  selectedDate: string;
}

export function buildGeminiPrompt(payload: GeminiInsightPayload): string {
  const compactEntries = payload.entries.slice(-90).map((entry) => ({
    date: entry.date,
    period: entry.isPeriod,
    flow: entry.flow,
    temperatures: entry.temperatureReadings.map((reading) => ({
      time: reading.time,
      value: reading.value,
      resting: reading.isResting,
      site: reading.site,
    })),
    cervicalMucus: entry.cervicalMucus,
    cervix: {
      height: entry.cervixHeight,
      firmness: entry.cervixFirmness,
      openness: entry.cervixOpenness,
    },
    note: entry.note || undefined,
  }));

  return [
    "Eres una asistente educativa para una app privada de registro menstrual y temperatura basal.",
    "Responde en español claro, cálido y breve. No diagnostiques, no des recomendaciones anticonceptivas, no afirmes ovulación con certeza y no sustituyas atención médica.",
    "Interpreta los datos como patrones observacionales. Si faltan datos, dilo con suavidad.",
    "Incluye 3 secciones con titulos cortos: Lectura, Datos a cuidar, Siguiente registro.",
    "Maximo 170 palabras.",
    "",
    `Fecha seleccionada: ${payload.selectedDate}`,
    `Resumen calculado: ${JSON.stringify(payload.stats)}`,
    `Registros recientes: ${JSON.stringify(compactEntries)}`,
  ].join("\n");
}
