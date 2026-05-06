export type FlowLevel = "none" | "light" | "medium" | "heavy";

export type CervicalMucus = "dry" | "sticky" | "creamy" | "watery" | "eggwhite";
export type CervixHeight = "low" | "middle" | "high";
export type CervixFirmness = "firm" | "medium" | "soft";
export type CervixOpenness = "closed" | "middle" | "open";

export interface TemperatureReading {
  id: string;
  time: string;
  value: number;
  isResting: boolean;
  note: string;
}

export interface CycleEntry {
  date: string;
  isPeriod: boolean;
  flow: FlowLevel;
  temperatureReadings: TemperatureReading[];
  /**
   * Legacy fields kept so old exports/imports can be migrated safely.
   */
  temperature?: number;
  questionableTemp: boolean;
  note: string;
  cervicalMucus?: CervicalMucus;
  cervixHeight?: CervixHeight;
  cervixFirmness?: CervixFirmness;
  cervixOpenness?: CervixOpenness;
  createdAt: string;
  updatedAt: string;
}

export interface CycleStats {
  cycleCount: number;
  averageCycleLength?: number;
  averagePeriodLength?: number;
  lastPeriodStart?: string;
  predictedNextPeriod?: string;
}

export interface ExportPayload {
  app: "ciclo-local";
  version: 1;
  exportedAt: string;
  entries: CycleEntry[];
}
