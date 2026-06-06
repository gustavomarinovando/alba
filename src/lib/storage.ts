import Dexie, { type Table } from "dexie";
import type { CycleEntry, ExportPayload } from "../types";
import { normalizeTemperatureReadings } from "./temperature";

class CycleDatabase extends Dexie {
  entries!: Table<CycleEntry, string>;
  syncQueue!: Table<PendingSyncMutation, string>;

  constructor() {
    super("ciclo-local");
    this.version(1).stores({
      entries: "&date, isPeriod, updatedAt",
    });
    this.version(2).stores({
      entries: "&date, isPeriod, updatedAt",
      syncQueue: "&date, type, queuedAt",
    });
  }
}

export const db = new CycleDatabase();

export interface PendingSyncMutation {
  date: string;
  type: "upsert" | "delete";
  entry?: CycleEntry;
  queuedAt: string;
  revision: string;
}

export async function getAllEntries(): Promise<CycleEntry[]> {
  const entries = await db.entries.orderBy("date").toArray();
  return entries.map(normalizeEntry);
}

export async function saveEntry(entry: CycleEntry): Promise<void> {
  await db.entries.put(normalizeEntry(entry));
}

export async function saveEntryForSync(entry: CycleEntry): Promise<void> {
  const normalized = normalizeEntry(entry);
  await db.transaction("rw", db.entries, db.syncQueue, async () => {
    await db.entries.put(normalized);
    await db.syncQueue.put({
      date: normalized.date,
      type: "upsert",
      entry: normalized,
      queuedAt: new Date().toISOString(),
      revision: crypto.randomUUID(),
    });
  });
}

export async function deleteEntry(date: string): Promise<void> {
  await db.entries.delete(date);
}

export async function deleteEntryForSync(date: string): Promise<void> {
  await db.transaction("rw", db.entries, db.syncQueue, async () => {
    await db.entries.delete(date);
    await db.syncQueue.put({
      date,
      type: "delete",
      queuedAt: new Date().toISOString(),
      revision: crypto.randomUUID(),
    });
  });
}

export async function getPendingSyncMutations(): Promise<PendingSyncMutation[]> {
  return db.syncQueue.orderBy("queuedAt").toArray();
}

export async function completePendingSyncMutation(date: string, revision: string): Promise<void> {
  await db.transaction("rw", db.syncQueue, async () => {
    const current = await db.syncQueue.get(date);
    if (current?.revision === revision) await db.syncQueue.delete(date);
  });
}

export async function applyRemoteEntry(entry: CycleEntry): Promise<boolean> {
  const normalized = normalizeEntry(entry);
  return db.transaction("rw", db.entries, db.syncQueue, async () => {
    if (await db.syncQueue.get(normalized.date)) return false;
    const local = await db.entries.get(normalized.date);
    if (local && Date.parse(local.updatedAt) >= Date.parse(normalized.updatedAt)) return false;
    await db.entries.put(normalized);
    return true;
  });
}

export async function applyRemoteDelete(date: string): Promise<boolean> {
  return db.transaction("rw", db.entries, db.syncQueue, async () => {
    if (await db.syncQueue.get(date)) return false;
    await db.entries.delete(date);
    return true;
  });
}

export async function replaceEntries(entries: CycleEntry[]): Promise<void> {
  await db.transaction("rw", db.entries, async () => {
    await db.entries.clear();
    await db.entries.bulkPut(entries);
  });
}

export async function clearEntries(): Promise<void> {
  await db.transaction("rw", db.entries, db.syncQueue, async () => {
    await db.entries.clear();
    await db.syncQueue.clear();
  });
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
