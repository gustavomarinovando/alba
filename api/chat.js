const PROVIDERS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-3.1-flash-lite",
    label: "Gemini",
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    modelEnv: "NVIDIA_MODEL",
    defaultModel: "z-ai/glm-5.2",
    label: "NVIDIA",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    label: "OpenAI",
  },
};

const MAX_MESSAGES = 60;
const MAX_BODY_LENGTH = 200_000;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PER_WINDOW = 20;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_DAY = 300;

// Per-IP request timestamps, in memory only. This is a best-effort brake, not a hard guarantee:
// it resets on a cold start and isn't shared across concurrent serverless instances/regions. It's
// there to stop an obvious scripted flood from running up the provider bill (there's no auth on
// this endpoint — guest mode means anyone can reach it) rather than to precisely meter usage. If
// traffic ever grows enough for multi-instance abuse to matter, move this to a shared store
// (a Supabase table, since one's already in use elsewhere; or Upstash Redis).
const requestLog = new Map();

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return request.socket?.remoteAddress || "unknown";
}

function checkRateLimit(ip) {
  const now = Date.now();

  // Opportunistic cleanup so the map doesn't grow forever with IPs that stopped requesting.
  if (Math.random() < 0.01) {
    for (const [key, times] of requestLog) {
      const fresh = times.filter((t) => now - t < RATE_LIMIT_DAY_MS);
      if (fresh.length === 0) requestLog.delete(key);
      else requestLog.set(key, fresh);
    }
  }

  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_DAY_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_PER_DAY) {
    requestLog.set(ip, timestamps);
    return { allowed: false, reason: "day", retryAfterSeconds: Math.ceil((timestamps[0] + RATE_LIMIT_DAY_MS - now) / 1000) };
  }

  const windowCount = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS).length;
  if (windowCount >= RATE_LIMIT_MAX_PER_WINDOW) {
    requestLog.set(ip, timestamps);
    return { allowed: false, reason: "burst", retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return { allowed: true };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Metodo no permitido." });
    return;
  }

  const rate = checkRateLimit(getClientIp(request));
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfterSeconds));
    response.status(429).json({
      error:
        rate.reason === "day"
          ? "Alcanzaste el límite de mensajes con Alba por hoy. Vuelve a intentar mañana."
          : "Estás enviando mensajes muy rápido. Espera un momento y vuelve a intentar.",
    });
    return;
  }

  const body = request.body ?? {};
  const messages = Array.isArray(body.messages) ? body.messages : null;

  if (!messages || messages.length === 0) {
    response.status(400).json({ error: "Falta el historial de mensajes." });
    return;
  }
  if (messages.length > MAX_MESSAGES) {
    response.status(400).json({ error: "La conversación es demasiado larga para enviarla de una vez." });
    return;
  }
  if (JSON.stringify(body).length > MAX_BODY_LENGTH) {
    response.status(400).json({ error: "La solicitud es demasiado grande." });
    return;
  }

  const provider = resolveProvider(body.provider);
  const config = PROVIDERS[provider];
  const apiKey = process.env[config.keyEnv];

  if (!apiKey) {
    response.status(500).json({ error: `Falta configurar la clave de ${config.label}.` });
    return;
  }

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : process.env[config.modelEnv] || config.defaultModel;

  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : undefined,
        tool_choice: body.tools && body.tools.length > 0 ? "auto" : undefined,
        stream: true,
        // Left unset unless the caller opts in: some models (e.g. gpt-5-nano) only
        // accept their default temperature and error out on any explicit value.
        temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errorText = await safeReadText(upstream);
      response.status(upstream.status || 500).json({
        error: parseUpstreamError(errorText) ?? `${config.label} no pudo responder ahora mismo.`,
      });
      return;
    }

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Alba-Provider", provider);
    response.setHeader("X-Alba-Model", model);

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(decoder.decode(value, { stream: true }));
    }
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({
        error: error instanceof Error ? error.message : "Error inesperado hablando con Alba.",
      });
    } else {
      response.end();
    }
  }
}

function resolveProvider(requested) {
  if (typeof requested === "string" && PROVIDERS[requested] && process.env[PROVIDERS[requested].keyEnv]) {
    return requested;
  }
  const fallback = process.env.AI_PROVIDER;
  if (fallback && PROVIDERS[fallback]) return fallback;
  return "nvidia";
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function parseUpstreamError(text) {
  if (!text) return undefined;
  try {
    // Gemini wraps its error body in an array; OpenAI/NVIDIA return a bare object.
    const parsed = JSON.parse(text);
    const errorObject = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    return errorObject?.message ?? (typeof errorObject === "string" ? errorObject : undefined);
  } catch {
    return undefined;
  }
}
