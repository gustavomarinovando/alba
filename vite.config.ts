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
        },
      },
    ],
  };
});
