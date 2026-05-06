import type { CervicalMucus, CervixFirmness, CervixHeight, CervixOpenness } from "../types";

export const mucusOptions: Array<{ value: CervicalMucus | ""; label: string }> = [
  { value: "", label: "No observado" },
  { value: "dry", label: "Seco" },
  { value: "sticky", label: "Pegajoso" },
  { value: "creamy", label: "Cremoso" },
  { value: "watery", label: "Acuoso" },
  { value: "eggwhite", label: "Clara de huevo" },
];

export const cervixHeightOptions: Array<{ value: CervixHeight | ""; label: string }> = [
  { value: "", label: "No observado" },
  { value: "low", label: "Bajo" },
  { value: "middle", label: "Medio" },
  { value: "high", label: "Alto" },
];

export const cervixFirmnessOptions: Array<{ value: CervixFirmness | ""; label: string }> = [
  { value: "", label: "No observado" },
  { value: "firm", label: "Firme" },
  { value: "medium", label: "Medio" },
  { value: "soft", label: "Blando" },
];

export const cervixOpennessOptions: Array<{ value: CervixOpenness | ""; label: string }> = [
  { value: "", label: "No observado" },
  { value: "closed", label: "Cerrado" },
  { value: "middle", label: "Medio" },
  { value: "open", label: "Abierto" },
];

export function optionLabel<T extends string>(options: Array<{ value: T | ""; label: string }>, value?: T): string {
  return options.find((option) => option.value === (value ?? ""))?.label ?? "No observado";
}
