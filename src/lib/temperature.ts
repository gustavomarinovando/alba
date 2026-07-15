import type { CycleEntry, TemperatureReading, TemperatureSite } from "../types";

const allowedSites = new Set<TemperatureSite>(["oral", "axillary", "vaginal"]);

function normalizeSite(site?: string): TemperatureSite {
  return allowedSites.has(site as TemperatureSite) ? (site as TemperatureSite) : "oral";
}

export function createTemperatureReading(value?: number, site: TemperatureSite = "oral", isResting = true): TemperatureReading {
  const now = new Date();

  return {
    id: crypto.randomUUID(),
    time: now.toTimeString().slice(0, 5),
    value: value ?? 36.5,
    isResting,
    site,
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
        site: normalizeSite(reading.site),
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
        site: "oral",
        note: "",
      },
    ];
  }

  return [];
}

export function getPrimaryTemperature(entry?: CycleEntry): TemperatureReading | undefined {
  if (!entry || entry.temperatureReadings.length === 0) return undefined;
  return (
    entry.temperatureReadings.find((reading) => reading.site === "oral" && reading.isResting) ??
    entry.temperatureReadings.find((reading) => reading.site === "oral") ??
    entry.temperatureReadings.find((reading) => reading.isResting) ??
    entry.temperatureReadings[0]
  );
}

export function getOralTemperature(entry?: CycleEntry): TemperatureReading | undefined {
  if (!entry || entry.temperatureReadings.length === 0) return undefined;
  return entry.temperatureReadings.find((reading) => reading.site === "oral" && reading.isResting) ?? entry.temperatureReadings.find((reading) => reading.site === "oral");
}

export function hasMeaningfulEntry(entry: CycleEntry): boolean {
  return (
    entry.isPeriod ||
    entry.temperatureReadings.length > 0 ||
    entry.note.trim().length > 0 ||
    Boolean(entry.cervicalMucus || entry.cervixHeight || entry.cervixFirmness || entry.cervixOpenness)
  );
}
