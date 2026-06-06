import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { CycleEntry } from "../types";
import { completePendingSyncMutation, getPendingSyncMutations } from "./storage";

const COUPLE_ID = 1;

interface SupabaseCycleRow {
  couple_id: number;
  date: string;
  entry: CycleEntry;
  updated_at: string;
}

interface SupabasePushSubscriptionRow {
  couple_id: number;
  endpoint: string;
  subscription: PushSubscriptionJSON;
  enabled: boolean;
  user_agent: string;
  updated_at: string;
}

export interface SupabaseSyncPreview {
  totalLocal: number;
  totalRemote: number;
  uploadOnly: string[];
  downloadOnly: string[];
  localNewer: string[];
  remoteNewer: string[];
  unchanged: string[];
}

export interface RealtimeCycleChange {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  date?: string;
  entry?: CycleEntry;
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

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const payload = subscription.toJSON();
  const endpoint = payload.endpoint;
  if (!endpoint) throw new Error("El navegador no entrego endpoint de push.");

  const row: SupabasePushSubscriptionRow = {
    couple_id: COUPLE_ID,
    endpoint,
    subscription: payload,
    enabled: true,
    user_agent: navigator.userAgent,
    updated_at: new Date().toISOString(),
  };

  const response = await fetch(`${baseUrl()}/rest/v1/push_subscriptions?on_conflict=couple_id,endpoint`, {
    method: "POST",
    headers: {
      ...headers(),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    throw new Error(`No se pudo guardar este dispositivo para push (${response.status}).`);
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

export async function pullFromSupabase(localEntries: CycleEntry[]): Promise<CycleEntry[]> {
  const remoteEntries = (await fetchRemoteEntries()).filter((entry) => !isDemoEntry(entry));
  return mergeEntries(
    localEntries.filter((entry) => !isDemoEntry(entry)),
    remoteEntries,
  ).sort((a, b) => a.date.localeCompare(b.date));
}

export async function previewSyncWithSupabase(localEntries: CycleEntry[]): Promise<SupabaseSyncPreview> {
  const safeLocalEntries = localEntries.filter((entry) => !isDemoEntry(entry));
  const remoteEntries = (await fetchRemoteEntries()).filter((entry) => !isDemoEntry(entry));
  return compareEntriesForSync(safeLocalEntries, remoteEntries);
}

export async function upsertSupabaseEntry(entry: CycleEntry): Promise<void> {
  if (isDemoEntry(entry)) return;
  await pushRemoteEntries([entry]);
}

export async function flushPendingSupabaseMutations(): Promise<number> {
  const pending = await getPendingSyncMutations();
  let completed = 0;

  for (const mutation of pending) {
    if (mutation.type === "upsert" && mutation.entry) {
      await upsertSupabaseEntry(mutation.entry);
    } else {
      await deleteSupabaseEntry(mutation.date);
    }
    await completePendingSyncMutation(mutation.date, mutation.revision);
    completed += 1;
  }

  return completed;
}

export function subscribeToCycleEntryChanges(
  onChange: (change: RealtimeCycleChange) => void,
  onStatus?: (status: string) => void,
): () => void {
  const client = supabaseClient();
  let channel: RealtimeChannel | null = client
    .channel(`alba-cycle-entries-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cycle_entries",
        filter: `couple_id=eq.${COUPLE_ID}`,
      },
      (payload) => {
        const newRow = payload.new as Partial<SupabaseCycleRow>;
        const oldRow = payload.old as Partial<SupabaseCycleRow>;
        onChange({
          eventType: payload.eventType,
          date: newRow.date ?? oldRow.date,
          entry: newRow.entry,
        });
      },
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    if (!channel) return;
    void client.removeChannel(channel);
    channel = null;
  };
}

export async function deleteSupabaseEntry(date: string): Promise<void> {
  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}&date=eq.${date}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`No se pudo borrar ese día en Supabase (${response.status}).`);
  }
}

export async function deleteAllSupabaseEntries(): Promise<void> {
  const response = await fetch(`${baseUrl()}/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!response.ok) {
    throw new Error(`No se pudieron borrar los datos en Supabase (${response.status}).`);
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

function compareEntriesForSync(localEntries: CycleEntry[], remoteEntries: CycleEntry[]): SupabaseSyncPreview {
  const localByDate = new Map(localEntries.map((entry) => [entry.date, entry]));
  const remoteByDate = new Map(remoteEntries.map((entry) => [entry.date, entry]));
  const dates = Array.from(new Set([...localByDate.keys(), ...remoteByDate.keys()])).sort();
  const preview: SupabaseSyncPreview = {
    totalLocal: localEntries.length,
    totalRemote: remoteEntries.length,
    uploadOnly: [],
    downloadOnly: [],
    localNewer: [],
    remoteNewer: [],
    unchanged: [],
  };

  for (const date of dates) {
    const local = localByDate.get(date);
    const remote = remoteByDate.get(date);

    if (local && !remote) {
      preview.uploadOnly.push(date);
      continue;
    }

    if (!local && remote) {
      preview.downloadOnly.push(date);
      continue;
    }

    if (!local || !remote) continue;

    const localUpdatedAt = new Date(local.updatedAt).getTime();
    const remoteUpdatedAt = new Date(remote.updatedAt).getTime();
    if (localUpdatedAt > remoteUpdatedAt) {
      preview.localNewer.push(date);
    } else if (remoteUpdatedAt > localUpdatedAt) {
      preview.remoteNewer.push(date);
    } else {
      preview.unchanged.push(date);
    }
  }

  return preview;
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

let sharedClient: ReturnType<typeof createClient> | null = null;

function supabaseClient(): ReturnType<typeof createClient> {
  if (sharedClient) return sharedClient;
  sharedClient = createClient(baseUrl(), String(import.meta.env.VITE_SUPABASE_ANON_KEY), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return sharedClient;
}
