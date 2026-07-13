import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { buildGeminiPrompt } from "./src/lib/geminiPrompt";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "gemini-local-api",
        configureServer(server) {
          server.middlewares.use("/api/insights", async (request, response) => {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end(JSON.stringify({ error: "Metodo no permitido." }));
            return;
          }

          const apiKey = env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
          if (!apiKey) {
            response.statusCode = 500;
            response.end(JSON.stringify({ error: "Falta configurar GEMINI_API_KEY." }));
            return;
          }

          try {
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }

            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const geminiResponse = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(payload) }] }],
                  generationConfig: {
                    temperature: 0.35,
                    maxOutputTokens: 420,
                  },
                }),
              },
            );

            const data = await geminiResponse.json();
            response.setHeader("Content-Type", "application/json");

            if (!geminiResponse.ok) {
              response.statusCode = geminiResponse.status;
              response.end(JSON.stringify({ error: data?.error?.message ?? "Gemini no pudo generar la lectura." }));
              return;
            }

            const insight = data?.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part.text)
              .join("\n")
              .trim();

            response.statusCode = 200;
            response.end(JSON.stringify({ insight }));
          } catch (error) {
            response.statusCode = 500;
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Error inesperado generando la lectura.",
              }),
            );
          }
          });

          server.middlewares.use("/api/chat", async (request, response) => {
            if (request.method !== "POST") {
              response.statusCode = 405;
              response.end(JSON.stringify({ error: "Metodo no permitido." }));
              return;
            }

            const providers: Record<string, { baseUrl: string; keyEnv: string; modelEnv: string; defaultModel: string; label: string }> = {
              gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-3.1-flash-lite", label: "Gemini" },
              nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", keyEnv: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL", defaultModel: "z-ai/glm-5.2", label: "NVIDIA" },
              openai: { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-4o-mini", label: "OpenAI" },
            };
            const readEnv = (key: string) => env[key] ?? process.env[key];

            try {
              const chunks: Buffer[] = [];
              for await (const chunk of request) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
              const messages = Array.isArray(body.messages) ? body.messages : null;

              if (!messages || messages.length === 0) {
                response.statusCode = 400;
                response.end(JSON.stringify({ error: "Falta el historial de mensajes." }));
                return;
              }

              const requestedProvider = typeof body.provider === "string" ? body.provider : undefined;
              const fallbackProvider = readEnv("AI_PROVIDER");
              const provider =
                requestedProvider && providers[requestedProvider] && readEnv(providers[requestedProvider].keyEnv)
                  ? requestedProvider
                  : fallbackProvider && providers[fallbackProvider]
                    ? fallbackProvider
                    : "nvidia";
              const config = providers[provider];
              const apiKey = readEnv(config.keyEnv);

              if (!apiKey) {
                response.statusCode = 500;
                response.end(JSON.stringify({ error: `Falta configurar la clave de ${config.label}.` }));
                return;
              }

              const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : readEnv(config.modelEnv) || config.defaultModel;

              const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model,
                  messages,
                  tools: Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : undefined,
                  tool_choice: body.tools && body.tools.length > 0 ? "auto" : undefined,
                  stream: true,
                  temperature: typeof body.temperature === "number" ? body.temperature : undefined,
                }),
              });

              if (!upstream.ok || !upstream.body) {
                const text = await upstream.text().catch(() => "");
                let message: string | undefined;
                try {
                  const parsed = JSON.parse(text);
                  const errorObject = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
                  message = errorObject?.message ?? (typeof errorObject === "string" ? errorObject : undefined);
                } catch {
                  // Non-JSON error body from upstream; fall back to the generic message below.
                }
                response.statusCode = upstream.status || 500;
                response.end(JSON.stringify({ error: message ?? `${config.label} no pudo responder ahora mismo.` }));
                return;
              }

              response.statusCode = 200;
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
                response.statusCode = 500;
                response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Error inesperado hablando con Alba." }));
              } else {
                response.end();
              }
            }
          });
        },
      },
    ],
  };
});
