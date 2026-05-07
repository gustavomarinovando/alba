export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Metodo no permitido." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "Falta configurar GEMINI_API_KEY." });
    return;
  }

  try {
    const prompt = buildGeminiPrompt(request.body);
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 420,
          },
        }),
      },
    );

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) {
      response.status(geminiResponse.status).json({
        error: data?.error?.message ?? "Gemini no pudo generar la lectura.",
      });
      return;
    }

    const insight = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim();
    response.status(200).json({ insight });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Error inesperado generando la lectura.",
    });
  }
}

function buildGeminiPrompt(payload) {
  const compactEntries = (payload.entries ?? []).slice(-90).map((entry) => ({
    date: entry.date,
    period: entry.isPeriod,
    flow: entry.flow,
    temperatures: (entry.temperatureReadings ?? []).map((reading) => ({
      time: reading.time,
      value: reading.value,
      resting: reading.isResting,
      site: reading.site,
    })),
    cervicalMucus: entry.cervicalMucus,
    cervix: {
      height: entry.cervixHeight,
      firmness: entry.cervixFirmness,
      openness: entry.cervixOpenness,
    },
    note: entry.note || undefined,
  }));

  return [
    "Eres una asistente educativa para una app privada de registro menstrual y temperatura basal.",
    "Responde en espanol claro, calido y breve. No diagnostiques, no des recomendaciones anticonceptivas, no afirmes ovulacion con certeza y no sustituyas atencion medica.",
    "Interpreta los datos como patrones observacionales. Si faltan datos, dilo con suavidad.",
    "Incluye 3 secciones con titulos cortos: Lectura, Datos a cuidar, Siguiente registro.",
    "Maximo 170 palabras.",
    "",
    `Fecha seleccionada: ${payload.selectedDate}`,
    `Resumen calculado: ${JSON.stringify(payload.stats)}`,
    `Registros recientes: ${JSON.stringify(compactEntries)}`,
  ].join("\n");
}
