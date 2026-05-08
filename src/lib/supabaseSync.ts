import type { CycleEntry } from "../types";

const COUPLE_ID = 1;

interface SupabaseCycleRow {
  couple_id: number;
  date: string;
  entry: CycleEntry;
  updated_at: string;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export async function testSupabaseConnection(): Promise<void> {
  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}&select=date&limit=1`, {
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error("Supabase respondio, pero no permitio leer cycle_entries.");
  }
}

export async function syncWithSupabase(localEntries: CycleEntry[]): Promise<CycleEntry[]> {
  const remoteEntries = (await fetchRemoteEntries()).filter((entry) => !isDemoEntry(entry));
  const merged = mergeEntries(
    localEntries.filter((entry) => !isDemoEntry(entry)),
    remoteEntries,
  );
  await pushRemoteEntries(merged);
  return merged.sort((a, b) => a.date.localeCompare(b.date));
}

export async function deleteSupabaseEntry(date: string): Promise<void> {
  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}&date=eq.${date}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`No se pudo borrar ese dia en Supabase (${response.status}). Revisa la policy DELETE.`);
  }
}

export async function deleteAllSupabaseEntries(): Promise<void> {
  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`No se pudieron borrar los datos en Supabase (${response.status}). Revisa la policy DELETE.`);
  }
}

async function fetchRemoteEntries(): Promise<CycleEntry[]> {
  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}&select=date,entry,updated_at`, {
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error("No se pudieron descargar los datos de Supabase.");
  }

  const rows = (await response.json()) as SupabaseCycleRow[];
  return rows.map((row) => row.entry);
}

async function pushRemoteEntries(entries: CycleEntry[]): Promise<void> {
  const safeEntries = entries.filter((entry) => !isDemoEntry(entry));
  const rows: SupabaseCycleRow[] = safeEntries.map((entry) => ({
    couple_id: COUPLE_ID,
    date: entry.date,
    entry,
    updated_at: entry.updatedAt,
  }));

  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?on_conflict=couple_id,date`, {
    method: "POST",
    headers: {
      ...headers(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error("No se pudieron subir los datos a Supabase.");
  }
}

export function isDemoEntry(entry: CycleEntry): boolean {
  return entry.temperatureReadings.some((reading) => reading.id.startsWith("demo-"));
}

function mergeEntries(localEntries: CycleEntry[], remoteEntries: CycleEntry[]): CycleEntry[] {
  const byDate = new Map<string, CycleEntry>();

  for (const entry of [...localEntries, ...remoteEntries]) {
    const existing = byDate.get(entry.date);
    if (!existing || new Date(entry.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      byDate.set(entry.date, entry);
    }
  }

  return Array.from(byDate.values());
}

function baseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("Falta VITE_SUPABASE_URL.");
  return url.replace(/\/$/, "");
}

function headers(): HeadersInit {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Falta VITE_SUPABASE_ANON_KEY.");

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}
