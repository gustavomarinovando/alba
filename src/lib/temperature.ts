import type { CycleEntry, TemperatureReading } from "../types";

export function createTemperatureReading(value?: number): TemperatureReading {
  const now = new Date();

  return {
    id: crypto.randomUUID(),
    time: now.toTimeString().slice(0, 5),
    value: value ?? 36.5,
    isResting: true,
    note: "",
  };
}

export function normalizeTemperatureReadings(entry: Partial<CycleEntry>): TemperatureReading[] {
  if (Array.isArray(entry.temperatureReadings)) {
    return entry.temperatureReadings
      .filter((reading) => typeof reading.value === "number")
      .map((reading) => ({
        id: reading.id || crypto.randomUUID(),
        time: reading.time || "07:00",
        value: reading.value,
        isResting: reading.isResting !== false,
        note: reading.note || "",
      }));
  }

  if (typeof entry.temperature === "number") {
    return [
      {
        id: crypto.randomUUID(),
        time: "07:00",
        value: entry.temperature,
        isResting: !entry.questionableTemp,
        note: "",
      },
    ];
  }

  return [];
}

export function getPrimaryTemperature(entry?: CycleEntry): TemperatureReading | undefined {
  if (!entry || entry.temperatureReadings.length === 0) return undefined;
  return entry.temperatureReadings.find((reading) => reading.isResting) ?? entry.temperatureReadings[0];
}

export function hasMeaningfulEntry(entry: CycleEntry): boolean {
  return (
    entry.isPeriod ||
    entry.temperatureReadings.length > 0 ||
    entry.note.trim().length > 0 ||
    Boolean(entry.cervicalMucus || entry.cervixHeight || entry.cervixFirmness || entry.cervixOpenness)
  );
}
