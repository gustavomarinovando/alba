import { getSupabaseClient, type AlbaAccountContext } from "./supabaseAuth";

export type RewardCategory = "comida" | "citas" | "picante" | "mimos" | "custom";

export type RewardUnlockMethod = "streak" | "currency";

export interface StreakReward {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: RewardCategory;
  /** Set for streak-gated coupons; unset for currency-only ones. Exactly one of thresholdDays/price is set. */
  thresholdDays?: number;
  /** Set for currency-gated coupons, in huellitas; unset for streak-only ones. */
  price?: number;
  createdBy: string;
  redeemedAt: string | null;
  redeemedBy?: string;
  createdAt: string;
}

export interface StreakRewardDraft {
  title: string;
  description: string;
  emoji: string;
  category: RewardCategory;
  thresholdDays?: number;
  price?: number;
}

export interface RewardTemplate extends StreakRewardDraft {
  id: string;
}

// Deliberately uncommon coupon ideas, grouped so the builder feels curated.
export const rewardTemplates: Record<Exclude<RewardCategory, "custom">, RewardTemplate[]> = {
  comida: [
    { id: "comida-ciegas", emoji: "🍽️", category: "comida", thresholdDays: 7, title: "Cena a ciegas", description: "Yo elijo el lugar y pido por ti. Tú solo confías (y no puedes mirar el menú)." },
    { id: "comida-antojo", emoji: "🌮", category: "comida", thresholdDays: 5, title: "Antojo de medianoche", description: "Vale por un antojo a cualquier hora, sin preguntas y sin quejas del repartidor." },
    { id: "comida-chef", emoji: "👨‍🍳", category: "comida", thresholdDays: 10, title: "Chef privado con menú firmado", description: "Cocino un menú de tres tiempos con nombre propio para cada plato. Dress code: pijama." },
    { id: "comida-mercado", emoji: "🧺", category: "comida", thresholdDays: 14, title: "Reto del mercado", description: "Vamos al mercado, 150 pesos cada uno, y cocinamos lo que el otro compró." },
  ],
  citas: [
    { id: "citas-misteriosa", emoji: "🎟️", category: "citas", thresholdDays: 10, title: "Cita misteriosa", description: "Solo te digo qué ropa llevar y a qué hora paso por ti. El resto es secreto." },
    { id: "citas-primera", emoji: "⏪", category: "citas", thresholdDays: 21, title: "Recrear la primera cita", description: "Mismo lugar, mismos nervios. Cada quien actúa como si apenas nos conociéramos." },
    { id: "citas-besos", emoji: "🗺️", category: "citas", thresholdDays: 14, title: "Tour de besos", description: "Una ruta por 5 lugares donde nunca nos hemos besado. Se documenta con fotos." },
    { id: "citas-atardecer", emoji: "🌅", category: "citas", thresholdDays: 7, title: "Secuestro al atardecer", description: "Te recojo 90 minutos antes del atardecer. Destino sorpresa con manta y snacks." },
  ],
  picante: [
    { id: "picante-masaje", emoji: "🕯️", category: "picante", thresholdDays: 7, title: "Masaje sin reloj", description: "Vale por un masaje completo con aceite y velas. El final lo decide quien lo recibe." },
    { id: "picante-moneda", emoji: "🪙", category: "picante", thresholdDays: 10, title: "La regla de la moneda", description: "Toda la noche: cara decides tú, cruz decido yo. Sin apelaciones." },
    { id: "picante-nota", emoji: "💌", category: "picante", thresholdDays: 14, title: "Instrucciones selladas", description: "Tres sobres numerados para abrir durante la noche. Lo que dicen, se cumple." },
    { id: "picante-manos", emoji: "🤫", category: "picante", thresholdDays: 21, title: "Noche sin manos", description: "Regla única: tú no puedes usar las tuyas. De todo lo demás me encargo yo." },
  ],
  mimos: [
    { id: "mimos-inmunidad", emoji: "🛡️", category: "mimos", thresholdDays: 7, title: "Inmunidad total", description: "Un día entero sin ninguna tarea de casa. Se puede invocar sin previo aviso." },
    { id: "mimos-lluvia", emoji: "🌧️", category: "mimos", thresholdDays: 5, title: "Siesta con lluvia artificial", description: "Siesta sincronizada con playlist de lluvia, cortinas cerradas y celulares en cuarentena." },
    { id: "mimos-pelo", emoji: "💆", category: "mimos", thresholdDays: 3, title: "30 minutos de caricias en el pelo", description: "Sin mirar el teléfono y sin decir 'ya casi'. Cronómetro visible." },
    { id: "mimos-mayordomo", emoji: "🛎️", category: "mimos", thresholdDays: 14, title: "Servicio de mayordomo", description: "Una tarde entera: agua, snacks, cobija y control remoto llegan solos a tus manos." },
  ],
};

export const rewardCategoryMeta: Record<RewardCategory, { label: string; emoji: string }> = {
  comida: { label: "Comida", emoji: "🍽️" },
  citas: { label: "Citas", emoji: "🎟️" },
  picante: { label: "Picante", emoji: "🌶️" },
  mimos: { label: "Mimos", emoji: "🫧" },
  custom: { label: "Personal", emoji: "✨" },
};

const CACHE_KEY = "alba-streak-rewards";

function readCache(): StreakReward[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as StreakReward[]) : [];
  } catch {
    return [];
  }
}

function writeCache(rewards: StreakReward[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rewards));
  } catch {
    // Storage full or unavailable; the cloud copy remains authoritative.
  }
}

function rowToReward(row: any): StreakReward {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    emoji: row.emoji ?? "🎁",
    category: row.category ?? "custom",
    thresholdDays: row.threshold_days ?? undefined,
    price: row.price ?? undefined,
    createdBy: row.created_by,
    redeemedAt: row.redeemed_at ?? null,
    redeemedBy: row.redeemed_by ?? undefined,
    createdAt: row.created_at,
  };
}

function isLocalId(id: string): boolean {
  return id.startsWith("local-");
}

export async function listStreakRewards(context: AlbaAccountContext | null): Promise<StreakReward[]> {
  const localOnly = readCache().filter((reward) => isLocalId(reward.id));
  if (!context) return readCache();
  try {
    const { data, error } = await getSupabaseClient()
      .from("streak_rewards")
      .select("*")
      .eq("couple_id", context.coupleId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const cloud = (data ?? []).map(rowToReward);
    const merged = [...cloud, ...localOnly];
    writeCache(merged);
    return merged;
  } catch {
    // Table missing (migration 013 pending) or offline: serve the cache.
    return readCache();
  }
}

export async function createStreakReward(context: AlbaAccountContext | null, draft: StreakRewardDraft): Promise<{ reward: StreakReward; savedToCloud: boolean }> {
  if (context) {
    try {
      const { data, error } = await getSupabaseClient()
        .from("streak_rewards")
        .insert({
          couple_id: context.coupleId,
          created_by: context.userId,
          title: draft.title,
          description: draft.description,
          emoji: draft.emoji,
          category: draft.category,
          // Only send the field that's actually set — a coupon created before migration 014 (which
          // adds `price` and drops threshold_days' NOT NULL) still round-trips fine as long as we
          // don't send a column the live schema doesn't have yet.
          ...(draft.thresholdDays != null ? { threshold_days: draft.thresholdDays } : {}),
          ...(draft.price != null ? { price: draft.price } : {}),
        })
        .select("*")
        .single();
      if (error) throw error;
      const reward = rowToReward(data);
      writeCache([...readCache().filter((item) => item.id !== reward.id), reward]);
      return { reward, savedToCloud: true };
    } catch {
      // Fall through to the local copy below.
    }
  }
  const reward: StreakReward = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: draft.title,
    description: draft.description,
    emoji: draft.emoji,
    category: draft.category,
    thresholdDays: draft.thresholdDays,
    price: draft.price,
    createdBy: context?.userId ?? "local",
    redeemedAt: null,
    createdAt: new Date().toISOString(),
  };
  writeCache([...readCache(), reward]);
  return { reward, savedToCloud: false };
}

export async function redeemStreakReward(context: AlbaAccountContext | null, id: string): Promise<void> {
  const redeemedAt = new Date().toISOString();
  const redeemedBy = context?.userId;
  if (context && !isLocalId(id)) {
    const { error } = await getSupabaseClient()
      .from("streak_rewards")
      .update({ redeemed_at: redeemedAt, redeemed_by: redeemedBy })
      .eq("id", id);
    if (error) throw error;
  }
  writeCache(readCache().map((reward) => (reward.id === id ? { ...reward, redeemedAt, redeemedBy } : reward)));
}

export async function deleteStreakReward(context: AlbaAccountContext | null, id: string): Promise<void> {
  if (context && !isLocalId(id)) {
    const { error } = await getSupabaseClient().from("streak_rewards").delete().eq("id", id);
    if (error) throw error;
  }
  writeCache(readCache().filter((reward) => reward.id !== id));
}
