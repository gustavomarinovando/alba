import Dexie, { type Table } from "dexie";
import type { CycleEntry, ExportPayload } from "../types";
import { normalizeTemperatureReadings } from "./temperature";

class CycleDatabase extends Dexie {
  entries!: Table<CycleEntry, string>;

  constructor() {
    super("ciclo-local");
    this.version(1).stores({
      entries: "&date, isPeriod, updatedAt",
    });
  }
}

export const db = new CycleDatabase();

export async function getAllEntries(): Promise<CycleEntry[]> {
  const entries = await db.entries.orderBy("date").toArray();
  return entries.map(normalizeEntry);
}

export async function saveEntry(entry: CycleEntry): Promise<void> {
  await db.entries.put(normalizeEntry(entry));
}

export async function deleteEntry(date: string): Promise<void> {
  await db.entries.delete(date);
}

export async function replaceEntries(entries: CycleEntry[]): Promise<void> {
  await db.transaction("rw", db.entries, async () => {
    await db.entries.clear();
    await db.entries.bulkPut(entries);
  });
}

export async function clearEntries(): Promise<void> {
  await db.entries.clear();
}

export function buildExport(entries: CycleEntry[]): ExportPayload {
  return {
    app: "ciclo-local",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export function parseImport(raw: string): CycleEntry[] {
  const payload = JSON.parse(raw) as Partial<ExportPayload>;
  if (payload.app !== "ciclo-local" || payload.version !== 1 || !Array.isArray(payload.entries)) {
    throw new Error("El archivo no parece ser una exportación válida de Alba.");
  }

  return payload.entries.map(normalizeEntry);
}

function normalizeEntry(entry: Partial<CycleEntry>): CycleEntry {
  return {
    date: assertString(entry.date, "date"),
    isPeriod: Boolean(entry.isPeriod),
    flow: entry.flow ?? "none",
    temperatureReadings: normalizeTemperatureReadings(entry),
    temperature: typeof entry.temperature === "number" ? entry.temperature : undefined,
    questionableTemp: Boolean(entry.questionableTemp),
    note: typeof entry.note === "string" ? entry.note : "",
    cervicalMucus: entry.cervicalMucus,
    cervixHeight: entry.cervixHeight,
    cervixFirmness: entry.cervixFirmness,
    cervixOpenness: entry.cervixOpenness,
    createdAt: assertString(entry.createdAt, "createdAt"),
    updatedAt: assertString(entry.updatedAt, "updatedAt"),
  };
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Falta el campo ${field}.`);
  }

  return value;
}
