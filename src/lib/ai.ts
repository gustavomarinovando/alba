import type { CycleEntry, CycleStats } from "../types";

export interface InsightRequest {
  entries: CycleEntry[];
  stats: CycleStats;
  selectedDate: string;
}

export interface InsightResponse {
  insight: string;
}

export async function requestCycleInsight(payload: InsightRequest): Promise<string> {
  const response = await fetch("/api/insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as Partial<InsightResponse> & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "No se pudo generar la lectura.");
  }

  if (!data.insight) {
    throw new Error("La respuesta de IA llego vacia.");
  }

  return data.insight;
}
