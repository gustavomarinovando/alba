import webpush from "web-push";

const COUPLE_ID = 1;
const MONTHLY_ANNIVERSARY_TITLE = "Buenos dias bonita, feliz mesario 🥰💕✨";
const MORNING_GREETINGS = ["Buenos días", "Muyyy buenos días", "Muy buenos días", "Muy pero muy buenos días"];
const MORNING_ENDEARMENTS = [
  "mi amor",
  "bonita",
  "mi amorcito",
  "mi amorcito de mi corazón",
  "amor mío",
  "mi niña preciosa",
  "chiquita",
  "mi cielito",
  "mi cielito lindo",
];
const MORNING_FACE_EMOJIS = ["🥰", "😚", "🤗", "☺️"];
const MORNING_HEART_EMOJIS = ["❤️", "💗", "💖", "💓", "💘", "💝", "💞", "💕", "❤️‍🔥", "❤️‍🩹"];
const TEMPERATURE_REMINDER_BODIES = [
  "Cuando puedas, anota tu temperatura amor mío.",
  "Toma una muestra pequeñita y sigue cuidando tu mapa.",
  "Si ya te levantaste estamos listos para tomar tu temperatura.",
];

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) {
    response.status(405).json({ error: "Metodo no permitido." });
    return;
  }

  try {
    configureWebPush();

    const today = localIsoDate();
    const hasTemperature = await hasTemperatureForDate(today);
    if (hasTemperature) {
      response.status(200).json({ sent: 0, skipped: "temperature_exists", date: today });
      return;
    }

    const subscriptions = await fetchSubscriptions();
    const payload = JSON.stringify({
      title: morningTitle(),
      body: morningBody(),
      tag: "alba-temperature-reminder",
      url: "/",
    });

    const results = await Promise.allSettled(
      subscriptions.map((subscription) => webpush.sendNotification(subscription.subscription, payload)),
    );

    const expiredEndpoints = results
      .map((result, index) => ({ result, endpoint: subscriptions[index]?.endpoint }))
      .filter(({ result }) => result.status === "rejected" && [404, 410].includes(result.reason?.statusCode))
      .map(({ endpoint }) => endpoint)
      .filter(Boolean);

    if (expiredEndpoints.length > 0) {
      await disableExpiredSubscriptions(expiredEndpoints);
    }

    response.status(200).json({
      sent: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
      expired: expiredEndpoints.length,
      date: today,
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "No se pudo enviar el recordatorio.",
    });
  }
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:alba@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("Faltan VAPID_PUBLIC_KEY/VITE_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function hasTemperatureForDate(date) {
  const rows = await supabaseFetch(
    `/rest/v1/cycle_entries?couple_id=eq.${COUPLE_ID}&date=eq.${date}&select=entry&limit=1`,
  );
  const entry = rows[0]?.entry;
  return Array.isArray(entry?.temperatureReadings) && entry.temperatureReadings.length > 0;
}

async function fetchSubscriptions() {
  return supabaseFetch(
    `/rest/v1/push_subscriptions?couple_id=eq.${COUPLE_ID}&enabled=eq.true&select=endpoint,subscription`,
  );
}

async function disableExpiredSubscriptions(endpoints) {
  await Promise.all(
    endpoints.map((endpoint) =>
      supabaseFetch(`/rest/v1/push_subscriptions?couple_id=eq.${COUPLE_ID}&endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() }),
      }),
    ),
  );
}

async function supabaseFetch(path, options = {}) {
  const url = supabaseUrl();
  const key = supabaseKey();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondio ${response.status}.`);
  }

  if (response.status === 204) return [];
  return response.json();
}

function supabaseUrl() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("Falta SUPABASE_URL o VITE_SUPABASE_URL.");
  return url.replace(/\/$/, "");
}

function supabaseKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY.");
  return key;
}

function localIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.ALBA_TIME_ZONE || "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function morningTitle() {
  if (localIsoDate().endsWith("-06")) return MONTHLY_ANNIVERSARY_TITLE;
  return `${pickRandom(MORNING_GREETINGS)} ${pickRandom(MORNING_ENDEARMENTS)} ${pickRandom(MORNING_FACE_EMOJIS)}${pickRandom(MORNING_HEART_EMOJIS)}`;
}

function morningBody() {
  return pickRandom(TEMPERATURE_REMINDER_BODIES);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}
