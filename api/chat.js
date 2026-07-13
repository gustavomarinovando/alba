const PROVIDERS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-flash-latest",
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

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Metodo no permitido." });
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
        temperature: typeof body.temperature === "number" ? body.temperature : 0.6,
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
  return "gemini";
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
    const parsed = JSON.parse(text);
    return parsed?.error?.message ?? (typeof parsed?.error === "string" ? parsed.error : undefined);
  } catch {
    return undefined;
  }
}
