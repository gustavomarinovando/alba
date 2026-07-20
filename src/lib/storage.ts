import Dexie, { type Table } from "dexie";
import type { CycleEntry, ExportPayload } from "../types";
import { normalizeTemperatureReadings } from "./temperature";

export const LEGACY_LOCAL_DATASET_ID = "legacy-local";

interface StoredCycleEntry extends CycleEntry {
  datasetId: string;
}

export interface LocalDataset {
  id: string;
  kind: "legacy" | "subject";
  subjectId?: string;
  createdAt: string;
  migratedAt?: string;
}

export interface PendingSyncMutation {
  datasetId: string;
  date: string;
  type: "upsert" | "delete";
  entry?: CycleEntry;
  queuedAt: string;
  revision: string;
}

interface LegacyPendingSyncMutation extends Omit<PendingSyncMutation, "datasetId"> {}

class CycleDatabase extends Dexie {
  /** Kept as a read-only rollback copy after the v3 migration. */
  entries!: Table<CycleEntry, string>;
  /** Kept as a read-only rollback copy after the v3 migration. */
  syncQueue!: Table<LegacyPendingSyncMutation, string>;
  cycleEntries!: Table<StoredCycleEntry, [string, string]>;
  syncQueueV3!: Table<PendingSyncMutation, [string, string]>;
  datasets!: Table<LocalDataset, string>;

  constructor() {
    super("ciclo-local");
    this.version(1).stores({
      entries: "&date, isPeriod, updatedAt",
    });
    this.version(2).stores({
      entries: "&date, isPeriod, updatedAt",
      syncQueue: "&date, type, queuedAt",
    });
    this.version(3)
      .stores({
        entries: "&date, isPeriod, updatedAt",
        syncQueue: "&date, type, queuedAt",
        cycleEntries: "&[datasetId+date], datasetId, date, isPeriod, updatedAt",
        syncQueueV3: "&[datasetId+date], datasetId, date, type, queuedAt",
        datasets: "&id, kind, subjectId, createdAt",
      })
      .upgrade(async (transaction) => {
        const migratedAt = new Date().toISOString();
        const legacyEntries = (await transaction.table<CycleEntry, string>("entries").toArray()).map((entry) => ({
          ...normalizeEntry(entry),
          datasetId: LEGACY_LOCAL_DATASET_ID,
        }));
        const legacyQueue = (await transaction.table<LegacyPendingSyncMutation, string>("syncQueue").toArray()).map((mutation) => ({
          ...mutation,
          datasetId: LEGACY_LOCAL_DATASET_ID,
        }));

        await transaction.table<LocalDataset, string>("datasets").put({
          id: LEGACY_LOCAL_DATASET_ID,
          kind: "legacy",
          createdAt: migratedAt,
          migratedAt,
        });
        if (legacyEntries.length > 0) {
          await transaction.table<StoredCycleEntry, [string, string]>("cycleEntries").bulkPut(legacyEntries);
        }
        if (legacyQueue.length > 0) {
          await transaction.table<PendingSyncMutation, [string, string]>("syncQueueV3").bulkPut(legacyQueue);
        }
      });
  }
}

export const db = new CycleDatabase();

export async function getAllEntries(datasetId = LEGACY_LOCAL_DATASET_ID): Promise<CycleEntry[]> {
  const entries = await db.cycleEntries.where("datasetId").equals(datasetId).sortBy("date");
  return entries.map(toCycleEntry);
}

export async function saveEntry(entry: CycleEntry, datasetId = LEGACY_LOCAL_DATASET_ID): Promise<void> {
  await ensureDataset(datasetId);
  await db.cycleEntries.put(toStoredEntry(entry, datasetId));
}

export async function saveEntryForSync(entry: CycleEntry, datasetId = LEGACY_LOCAL_DATASET_ID): Promise<void> {
  const normalized = normalizeEntry(entry);
  await ensureDataset(datasetId);
  await db.transaction("rw", db.cycleEntries, db.syncQueueV3, async () => {
    await db.cycleEntries.put(toStoredEntry(normalized, datasetId));
    await db.syncQueueV3.put({
      datasetId,
      date: normalized.date,
      type: "upsert",
      entry: normalized,
      queuedAt: new Date().toISOString(),
      revision: crypto.randomUUID(),
    });
  });
}

export async function deleteEntry(date: string, datasetId = LEGACY_LOCAL_DATASET_ID): Promise<void> {
  await db.cycleEntries.delete([datasetId, date]);
}

export async function deleteEntryForSync(date: string, datasetId = LEGACY_LOCAL_DATASET_ID): Promise<void> {
  await ensureDataset(datasetId);
  await db.transaction("rw", db.cycleEntries, db.syncQueueV3, async () => {
    await db.cycleEntries.delete([datasetId, date]);
    await db.syncQueueV3.put({
      datasetId,
      date,
      type: "delete",
      queuedAt: new Date().toISOString(),
      revision: crypto.randomUUID(),
    });
  });
}

export async function getPendingSyncMutations(datasetId = LEGACY_LOCAL_DATASET_ID): Promise<PendingSyncMutation[]> {
  return db.syncQueueV3.where("datasetId").equals(datasetId).sortBy("queuedAt");
}

export async function completePendingSyncMutation(
  date: string,
  revision: string,
  datasetId = LEGACY_LOCAL_DATASET_ID,
): Promise<void> {
  await db.transaction("rw", db.syncQueueV3, async () => {
    const key: [string, string] = [datasetId, date];
    const current = await db.syncQueueV3.get(key);
    if (current?.revision === revision) await db.syncQueueV3.delete(key);
  });
}

export async function applyRemoteEntry(entry: CycleEntry, datasetId = LEGACY_LOCAL_DATASET_ID): Promise<boolean> {
  const normalized = normalizeEntry(entry);
  await ensureDataset(datasetId);
  return db.transaction("rw", db.cycleEntries, db.syncQueueV3, async () => {
    const key: [string, string] = [datasetId, normalized.date];
    if (await db.syncQueueV3.get(key)) return false;
    const local = await db.cycleEntries.get(key);
    if (local && Date.parse(local.updatedAt) >= Date.parse(normalized.updatedAt)) return false;
    await db.cycleEntries.put(toStoredEntry(normalized, datasetId));
    return true;
  });
}

export async function applyRemoteDelete(date: string, datasetId = LEGACY_LOCAL_DATASET_ID): Promise<boolean> {
  await ensureDataset(datasetId);
  return db.transaction("rw", db.cycleEntries, db.syncQueueV3, async () => {
    const key: [string, string] = [datasetId, date];
    if (await db.syncQueueV3.get(key)) return false;
    await db.cycleEntries.delete(key);
    return true;
  });
}

export async function replaceEntries(entries: CycleEntry[], datasetId = LEGACY_LOCAL_DATASET_ID): Promise<void> {
  await ensureDataset(datasetId);
  const storedEntries = entries.map((entry) => toStoredEntry(entry, datasetId));
  await db.transaction("rw", db.cycleEntries, db.syncQueueV3, async () => {
    const pending = await db.syncQueueV3.where("datasetId").equals(datasetId).toArray();
    await db.cycleEntries.where("datasetId").equals(datasetId).delete();
    if (storedEntries.length > 0) await db.cycleEntries.bulkPut(storedEntries);

    // A pull or restore must not erase local intent that has not reached Supabase yet.
    for (const mutation of pending) {
      const key: [string, string] = [datasetId, mutation.date];
      if (mutation.type === "delete") {
        await db.cycleEntries.delete(key);
      } else if (mutation.entry) {
        await db.cycleEntries.put(toStoredEntry(mutation.entry, datasetId));
      }
    }
  });
}

export async function clearEntries(datasetId = LEGACY_LOCAL_DATASET_ID): Promise<void> {
  await db.transaction("rw", db.cycleEntries, db.syncQueueV3, async () => {
    await db.cycleEntries.where("datasetId").equals(datasetId).delete();
    await db.syncQueueV3.where("datasetId").equals(datasetId).delete();
  });
}

export async function bindDatasetToSubject(datasetId: string, subjectId: string): Promise<void> {
  const current = await db.datasets.get(datasetId);
  // A device's local cache must not carry entries across subjects: logging into a
  // different account/couple on a device previously bound to someone else's subject
  // (e.g. testing an invite flow, or a shared device) would otherwise leave stale local
  // rows in place, and the sync merge's "keep the newer updatedAt" rule can then shadow
  // that other subject's real cloud data indefinitely. Only a true first-time bind
  // (no prior subject, the original single-account legacy migration) carries local data
  // forward; any actual subject switch gets a clean slate and re-pulls from the cloud.
  if (current?.kind === "subject" && current.subjectId && current.subjectId !== subjectId) {
    await clearEntries(datasetId);
  }
  await db.datasets.put({
    id: datasetId,
    kind: "subject",
    subjectId,
    createdAt: current?.createdAt ?? new Date().toISOString(),
    migratedAt: current?.migratedAt,
  });
}

export async function getDataset(datasetId = LEGACY_LOCAL_DATASET_ID): Promise<LocalDataset | undefined> {
  return db.datasets.get(datasetId);
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

async function ensureDataset(datasetId: string): Promise<void> {
  if (await db.datasets.get(datasetId)) return;
  await db.datasets.put({
    id: datasetId,
    kind: "legacy",
    createdAt: new Date().toISOString(),
  });
}

function toStoredEntry(entry: Partial<CycleEntry>, datasetId: string): StoredCycleEntry {
  return { ...normalizeEntry(entry), datasetId };
}

function toCycleEntry(entry: StoredCycleEntry): CycleEntry {
  const { datasetId: _datasetId, ...cycleEntry } = entry;
  return normalizeEntry(cycleEntry);
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
